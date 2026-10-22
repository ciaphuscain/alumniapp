import type { PoolClient } from 'pg';
import { audit } from '../../lib/audit.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { ACTIVE_VERIFIED, MEMBER_FROM, notBlocked, viewableBy } from '../../policy/visibility.ts';

export interface RequestRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  state: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string | null;
  created_at: Date;
}

export type SendOutcome = 'created' | 'existing' | 'accepted_reciprocal';

/**
 * Serializes every relationship change for one unordered pair of users within the current
 * transaction. This closes the reciprocal-request race (A->B and B->A at the same instant)
 * that the partial unique index alone would turn into a confusing error.
 */
export async function lockPair(tx: PoolClient, a: string, b: string): Promise<void> {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
}

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

export async function areConnected(tx: PoolClient, a: string, b: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    'SELECT 1 FROM connections WHERE user_low = $1 AND user_high = $2',
    pair(a, b),
  );
  return (rowCount ?? 0) > 0;
}

async function pendingBetween(tx: PoolClient, a: string, b: string): Promise<RequestRow | null> {
  const { rows } = await tx.query<RequestRow>(
    `SELECT * FROM connection_requests
      WHERE state = 'pending'
        AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [a, b],
  );
  return rows[0] ?? null;
}

/** The other party must still be an active, verified member and neither side may have blocked the other. */
async function assertCounterpartEligible(
  tx: PoolClient,
  viewerId: string,
  otherId: string,
): Promise<void> {
  const { rowCount } = await tx.query(
    `SELECT 1 FROM ${MEMBER_FROM} WHERE p.user_id = $2 AND ${ACTIVE_VERIFIED} AND ${notBlocked('$1')}`,
    [viewerId, otherId],
  );
  if (!rowCount) throw notFound('Member');
}

async function respond(
  tx: PoolClient,
  req: RequestRow,
  to: 'accepted' | 'declined' | 'cancelled',
  actorId: string,
): Promise<RequestRow> {
  const { rows } = await tx.query<RequestRow>(
    `UPDATE connection_requests SET state = $2, responded_at = now()
      WHERE id = $1 AND state = 'pending' RETURNING *`,
    [req.id, to],
  );
  const updated = rows[0];
  if (!updated) throw conflict('This request is no longer pending');
  if (to === 'accepted') {
    const [low, high] = pair(req.requester_id, req.addressee_id);
    await tx.query(
      `INSERT INTO connections (user_low, user_high, created_from_request_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [low, high, req.id],
    );
  }
  await audit(tx, {
    actorId,
    action: `connection_request.${to}`,
    subjectType: 'connection_request',
    subjectId: req.id,
    metadata: { requesterId: req.requester_id, addresseeId: req.addressee_id },
  });
  return updated;
}

export async function sendRequest(
  tx: PoolClient,
  senderId: string,
  addresseeId: string,
  message: string | undefined,
): Promise<{ outcome: SendOutcome; request: RequestRow }> {
  if (senderId === addresseeId)
    throw new AppError('VALIDATION', 'You cannot connect with yourself');
  await lockPair(tx, senderId, addresseeId);

  const { rowCount } = await tx.query(
    `SELECT 1 FROM ${MEMBER_FROM} WHERE p.user_id = $2 AND ${viewableBy('$1')}`,
    [senderId, addresseeId],
  );
  if (!rowCount) throw notFound('Member');
  if (await areConnected(tx, senderId, addresseeId)) throw conflict('You are already connected');

  const pending = await pendingBetween(tx, senderId, addresseeId);
  if (pending?.requester_id === senderId) return { outcome: 'existing', request: pending };
  if (pending) {
    // The other person already asked us: treat this as acceptance rather than a second request.
    return {
      outcome: 'accepted_reciprocal',
      request: await respond(tx, pending, 'accepted', senderId),
    };
  }

  const { rows } = await tx.query<RequestRow>(
    `INSERT INTO connection_requests (requester_id, addressee_id, message) VALUES ($1, $2, $3) RETURNING *`,
    [senderId, addresseeId, message || null],
  );
  const created = rows[0]!;
  await audit(tx, {
    actorId: senderId,
    action: 'connection_request.created',
    subjectType: 'connection_request',
    subjectId: created.id,
    metadata: { addresseeId },
  });
  return { outcome: 'created', request: created };
}

export async function actOnRequest(
  tx: PoolClient,
  actorId: string,
  requestId: string,
  action: 'accept' | 'decline' | 'cancel',
): Promise<RequestRow> {
  const { rows } = await tx.query<RequestRow>('SELECT * FROM connection_requests WHERE id = $1', [
    requestId,
  ]);
  const req = rows[0];
  // Requests are only visible to their two participants.
  if (!req || (req.requester_id !== actorId && req.addressee_id !== actorId))
    throw notFound('Request');
  const mustBe = action === 'cancel' ? req.requester_id : req.addressee_id;
  if (mustBe !== actorId) {
    throw forbidden(
      action === 'cancel'
        ? 'Only the sender can cancel a request'
        : 'Only the recipient can respond',
    );
  }
  await lockPair(tx, req.requester_id, req.addressee_id);
  if (action === 'accept') await assertCounterpartEligible(tx, actorId, req.requester_id);
  const to = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled';
  return respond(tx, req, to, actorId);
}

export async function removeConnection(
  tx: PoolClient,
  actorId: string,
  otherId: string,
): Promise<void> {
  await lockPair(tx, actorId, otherId);
  const { rowCount } = await tx.query(
    'DELETE FROM connections WHERE user_low = $1 AND user_high = $2',
    pair(actorId, otherId),
  );
  if (!rowCount) throw notFound('Connection');
  await audit(tx, {
    actorId,
    action: 'connection.removed',
    subjectType: 'user',
    subjectId: otherId,
  });
}

/** Blocking severs the relationship: pending requests are cancelled and any connection is removed. */
export async function block(tx: PoolClient, blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) throw new AppError('VALIDATION', 'You cannot block yourself');
  await lockPair(tx, blockerId, blockedId);
  const { rowCount: exists } = await tx.query('SELECT 1 FROM users WHERE id = $1', [blockedId]);
  if (!exists) return; // Same response as success: does not confirm whether an id exists.
  await tx.query(
    'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [blockerId, blockedId],
  );
  await tx.query(
    `UPDATE connection_requests SET state = 'cancelled', responded_at = now()
      WHERE state = 'pending'
        AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [blockerId, blockedId],
  );
  await tx.query(
    'DELETE FROM connections WHERE user_low = $1 AND user_high = $2',
    pair(blockerId, blockedId),
  );
  await audit(tx, {
    actorId: blockerId,
    action: 'user.blocked',
    subjectType: 'user',
    subjectId: blockedId,
  });
}
