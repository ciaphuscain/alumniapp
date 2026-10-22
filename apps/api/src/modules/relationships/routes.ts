import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ConnectionRequestInput, type ConnectionRequestView } from '@alumni/shared';
import type { AppDeps } from '../../app.ts';
import { withTx } from '../../db/client.ts';
import { audit } from '../../lib/audit.ts';
import { IdParam, UserIdParam, parse } from '../../lib/http.ts';
import { assertVerifiedMember, loadViewer } from '../../policy/viewer.ts';
import { requireAuth } from '../identity/session.ts';
import { actOnRequest, block, removeConnection, sendRequest, type RequestRow } from './service.ts';

const DirectionQuery = z.strictObject({
  direction: z.enum(['incoming', 'outgoing']).default('incoming'),
});
const BlockInput = z.strictObject({ userId: z.uuid() });

const requestView = (r: RequestRow) => ({
  id: r.id,
  state: r.state,
  requesterId: r.requester_id,
  addresseeId: r.addressee_id,
  message: r.message,
  createdAt: r.created_at,
});

export async function relationshipRoutes(app: FastifyInstance, { pool }: AppDeps): Promise<void> {
  async function member(req: Parameters<typeof requireAuth>[0]): Promise<string> {
    const { userId } = requireAuth(req);
    assertVerifiedMember(await loadViewer(pool, userId));
    return userId;
  }

  app.post('/api/connections/requests', async (req, reply) => {
    const userId = await member(req);
    const { addresseeId, message } = parse(ConnectionRequestInput, req.body);
    const { outcome, request } = await withTx(pool, (tx) =>
      sendRequest(tx, userId, addresseeId, message),
    );
    return reply
      .code(outcome === 'created' ? 201 : 200)
      .send({ outcome, request: requestView(request) });
  });

  app.get(
    '/api/connections/requests',
    async (req): Promise<{ requests: ConnectionRequestView[] }> => {
      const userId = await member(req);
      const { direction } = parse(DirectionQuery, req.query);
      const mine = direction === 'incoming' ? 'addressee_id' : 'requester_id';
      const other = direction === 'incoming' ? 'requester_id' : 'addressee_id';
      const { rows } = await pool.query(
        `SELECT r.id, r.state, r.message, r.created_at, p.user_id, p.display_name, p.headline
         FROM connection_requests r
         JOIN users u ON u.id = r.${other} AND u.status = 'active'
         JOIN profiles p ON p.user_id = r.${other}
        WHERE r.${mine} = $1 AND r.state = 'pending'
        ORDER BY r.created_at DESC, r.id
        LIMIT 200`,
        [userId],
      );
      return {
        requests: rows.map((r) => ({
          id: r.id,
          state: r.state,
          message: r.message,
          createdAt: r.created_at,
          other: { userId: r.user_id, displayName: r.display_name, headline: r.headline },
        })),
      };
    },
  );

  for (const action of ['accept', 'decline', 'cancel'] as const) {
    app.post(`/api/connections/requests/:id/${action}`, async (req) => {
      const userId = await member(req);
      const { id } = parse(IdParam, req.params);
      const updated = await withTx(pool, (tx) => actOnRequest(tx, userId, id, action));
      return { request: requestView(updated) };
    });
  }

  app.get('/api/connections', async (req) => {
    const userId = await member(req);
    const { rows } = await pool.query(
      `SELECT p.user_id, p.display_name, p.headline, p.current_company, c.created_at
         FROM connections c
         JOIN profiles p ON p.user_id = CASE WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low END
         JOIN users u ON u.id = p.user_id AND u.status = 'active'
        WHERE c.user_low = $1 OR c.user_high = $1
        ORDER BY p.display_name, p.user_id`,
      [userId],
    );
    return {
      connections: rows.map((r) => ({
        userId: r.user_id,
        displayName: r.display_name,
        headline: r.headline,
        currentCompany: r.current_company,
        connectedAt: r.created_at,
      })),
    };
  });

  app.delete('/api/connections/:userId', async (req, reply) => {
    const { userId: me } = requireAuth(req);
    const { userId } = parse(UserIdParam, req.params);
    await withTx(pool, (tx) => removeConnection(tx, me, userId));
    return reply.code(204).send();
  });

  app.post('/api/blocks', async (req, reply) => {
    const { userId: me } = requireAuth(req);
    const { userId } = parse(BlockInput, req.body);
    await withTx(pool, (tx) => block(tx, me, userId));
    return reply.code(204).send();
  });

  app.delete('/api/blocks/:userId', async (req, reply) => {
    const { userId: me } = requireAuth(req);
    const { userId } = parse(UserIdParam, req.params);
    await withTx(pool, async (tx) => {
      const { rowCount } = await tx.query(
        'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
        [me, userId],
      );
      if (rowCount)
        await audit(tx, {
          actorId: me,
          action: 'user.unblocked',
          subjectType: 'user',
          subjectId: userId,
        });
    });
    return reply.code(204).send();
  });

  app.get('/api/blocks', async (req) => {
    const { userId: me } = requireAuth(req);
    const { rows } = await pool.query(
      `SELECT b.blocked_id, p.display_name, b.created_at FROM blocks b
         LEFT JOIN profiles p ON p.user_id = b.blocked_id
        WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [me],
    );
    return {
      blocks: rows.map((r) => ({
        userId: r.blocked_id,
        displayName: r.display_name,
        blockedAt: r.created_at,
      })),
    };
  });
}
