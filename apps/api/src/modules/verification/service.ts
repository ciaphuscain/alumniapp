import type { PoolClient } from 'pg';
import type { VerificationState } from '@alumni/shared';
import type { Config } from '../../config.ts';
import { audit } from '../../lib/audit.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import { nextState, type VerificationAction } from './state-machine.ts';

export interface CaseRow {
  id: string;
  state: VerificationState;
  user_id: string;
  role: string;
}

/** Locks and returns the case so concurrent decisions serialize on the row. */
export async function lockCase(
  tx: PoolClient,
  where: { caseId?: string; userId?: string },
): Promise<CaseRow | null> {
  const { rows } = await tx.query<CaseRow>(
    `SELECT vc.id, vc.state, ac.user_id, ac.role
       FROM verification_cases vc JOIN affiliation_claims ac ON ac.id = vc.claim_id
      WHERE ${where.caseId ? 'vc.id = $1' : 'ac.user_id = $1'}
      FOR UPDATE OF vc`,
    [where.caseId ?? where.userId],
  );
  return rows[0] ?? null;
}

export async function transition(
  tx: PoolClient,
  c: CaseRow,
  action: VerificationAction,
  opts: { actorId: string | null; method?: 'institutional_email' | 'admin_review'; note?: string },
): Promise<VerificationState> {
  const to = nextState(c.state, action);
  if (!to) throw conflict(`Cannot ${action.replace('_', ' ')} a case that is ${c.state}`);
  const decided = to === 'verified' || to === 'rejected' || to === 'revoked';
  await tx.query(
    `UPDATE verification_cases
        SET state = $2,
            method = CASE WHEN $2 = 'verified' THEN $3 ELSE method END,
            reviewer_id = CASE WHEN $6 THEN $4::uuid ELSE reviewer_id END,
            rationale = CASE WHEN $6 THEN $5 ELSE rationale END,
            decided_at = CASE WHEN $6 THEN now() ELSE decided_at END,
            updated_at = now()
      WHERE id = $1`,
    [
      c.id,
      to,
      opts.method ?? null,
      opts.actorId,
      opts.note ?? null,
      decided && action !== 'auto_verify',
    ],
  );
  await tx.query(
    `INSERT INTO verification_events (case_id, from_state, to_state, method, actor_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [c.id, c.state, to, opts.method ?? null, opts.actorId, opts.note ?? null],
  );
  await audit(tx, {
    actorId: opts.actorId,
    action: `verification.${action}`,
    subjectType: 'verification_case',
    subjectId: c.id,
    metadata: { from: c.state, to, userId: c.user_id },
  });
  return to;
}

/**
 * If the user's verified email belongs to a domain configured as proof of the role they
 * claimed, verify the pending case automatically. Department, degree and graduation year
 * remain self-declared; only the role affiliation is proven by the mailbox.
 */
export async function evaluateAutoVerification(
  tx: PoolClient,
  config: Config,
  userId: string,
): Promise<void> {
  const { rows } = await tx.query<{ email: string; email_verified: boolean }>(
    'SELECT email, email_verified_at IS NOT NULL AS email_verified FROM users WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user?.email_verified) return;
  const c = await lockCase(tx, { userId });
  if (!c || c.state !== 'pending') return;
  const domain = user.email.split('@')[1]?.toLowerCase() ?? '';
  if (config.verificationEmailDomains.get(domain) !== c.role) return;
  await transition(tx, c, 'auto_verify', {
    actorId: null,
    method: 'institutional_email',
    note: `Verified ownership of @${domain} mailbox`,
  });
}

export async function requireCase(tx: PoolClient, caseId: string): Promise<CaseRow> {
  const c = await lockCase(tx, { caseId });
  if (!c) throw notFound('Verification case');
  return c;
}
