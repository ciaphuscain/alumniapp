import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AffiliationClaimInput, VerificationDecisionInput } from '@alumni/shared';
import type { AppDeps } from '../../app.ts';
import { withTx } from '../../db/client.ts';
import { audit } from '../../lib/audit.ts';
import { conflict, forbidden } from '../../lib/errors.ts';
import { IdParam, parse } from '../../lib/http.ts';
import { assertAdmin, loadViewer } from '../../policy/viewer.ts';
import { requireAuth } from '../identity/session.ts';
import { evaluateAutoVerification, lockCase, requireCase, transition } from './service.ts';

const AppealInput = z.strictObject({ note: z.string().trim().min(10).max(1000) });
const QueueQuery = z.strictObject({
  state: z
    .enum(['pending', 'under_review', 'appealed', 'verified', 'rejected', 'revoked'])
    .optional(),
});

export async function verificationRoutes(
  app: FastifyInstance,
  { pool, config }: AppDeps,
): Promise<void> {
  /** Submit or (while still pending) amend the affiliation claim. */
  app.put('/api/me/affiliation', async (req) => {
    const { userId } = requireAuth(req);
    const input = parse(AffiliationClaimInput, req.body);
    const viewer = await loadViewer(pool, userId);
    if (!viewer.emailVerified) throw forbidden('Verify your email address first');

    return withTx(pool, async (tx) => {
      const existing = await lockCase(tx, { userId });
      if (existing && existing.state !== 'pending') {
        throw conflict(
          existing.state === 'rejected'
            ? 'This claim was rejected; submit an appeal instead'
            : `A ${existing.state} claim cannot be changed here`,
        );
      }
      const values = [
        userId,
        input.role,
        input.department,
        input.degree ?? null,
        input.graduationYear ?? null,
        input.evidenceNote ?? null,
      ];
      if (existing) {
        await tx.query(
          `UPDATE affiliation_claims SET role = $2, department = $3, degree = $4, graduation_year = $5,
                  evidence_note = $6, updated_at = now() WHERE user_id = $1`,
          values,
        );
      } else {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO affiliation_claims (user_id, role, department, degree, graduation_year, evidence_note)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          values,
        );
        const { rows: cases } = await tx.query<{ id: string }>(
          `INSERT INTO verification_cases (claim_id) VALUES ($1) RETURNING id`,
          [rows[0]!.id],
        );
        await tx.query(
          `INSERT INTO verification_events (case_id, from_state, to_state, actor_id) VALUES ($1, NULL, 'pending', $2)`,
          [cases[0]!.id, userId],
        );
      }
      await audit(tx, {
        actorId: userId,
        action: existing ? 'affiliation.amended' : 'affiliation.claimed',
        subjectType: 'user',
        subjectId: userId,
        metadata: { role: input.role },
      });
      await evaluateAutoVerification(tx, config, userId);
      const after = await lockCase(tx, { userId });
      return { verificationState: after!.state };
    });
  });

  app.post('/api/me/affiliation/appeal', async (req) => {
    const { userId } = requireAuth(req);
    const { note } = parse(AppealInput, req.body);
    return withTx(pool, async (tx) => {
      const c = await lockCase(tx, { userId });
      if (!c) throw conflict('There is no claim to appeal');
      const state = await transition(tx, c, 'appeal', { actorId: userId, note });
      return { verificationState: state };
    });
  });

  // ------------------------------------------------------------- admin review
  app.get('/api/admin/verification-cases', async (req) => {
    const { userId } = requireAuth(req);
    assertAdmin(await loadViewer(pool, userId));
    const { state } = parse(QueueQuery, req.query);
    const { rows } = await pool.query(
      `SELECT vc.id, vc.state, vc.method, vc.rationale, vc.created_at, vc.updated_at,
              u.id AS user_id, u.email, p.display_name,
              ac.role, ac.department, ac.degree, ac.graduation_year, ac.evidence_note,
              (SELECT coalesce(json_agg(json_build_object(
                        'from', e.from_state, 'to', e.to_state, 'note', e.note, 'at', e.created_at) ORDER BY e.id), '[]')
                 FROM verification_events e WHERE e.case_id = vc.id) AS history
         FROM verification_cases vc
         JOIN affiliation_claims ac ON ac.id = vc.claim_id
         JOIN users u ON u.id = ac.user_id
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE ($1::text IS NULL AND vc.state IN ('pending', 'under_review', 'appealed')) OR vc.state = $1
        ORDER BY vc.created_at, vc.id
        LIMIT 100`,
      [state ?? null],
    );
    return {
      cases: rows.map((r) => ({
        id: r.id,
        state: r.state,
        method: r.method,
        rationale: r.rationale,
        createdAt: r.created_at,
        user: { id: r.user_id, email: r.email, displayName: r.display_name },
        claim: {
          role: r.role,
          department: r.department,
          degree: r.degree,
          graduationYear: r.graduation_year,
          evidenceNote: r.evidence_note,
        },
        history: r.history,
      })),
    };
  });

  app.post('/api/admin/verification-cases/:id/decision', async (req) => {
    const { userId } = requireAuth(req);
    assertAdmin(await loadViewer(pool, userId));
    const { id } = parse(IdParam, req.params);
    const { decision, rationale } = parse(VerificationDecisionInput, req.body);
    return withTx(pool, async (tx) => {
      const c = await requireCase(tx, id);
      if (c.user_id === userId)
        throw forbidden('Administrators cannot decide their own verification');
      const state = await transition(tx, c, decision, {
        actorId: userId,
        method: decision === 'verify' ? 'admin_review' : undefined,
        note: rationale,
      });
      return { id, verificationState: state };
    });
  });
}
