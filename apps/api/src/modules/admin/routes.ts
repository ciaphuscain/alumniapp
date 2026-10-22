import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../../app.ts';
import { withTx } from '../../db/client.ts';
import { audit } from '../../lib/audit.ts';
import { forbidden, notFound } from '../../lib/errors.ts';
import { IdParam, parse } from '../../lib/http.ts';
import { assertAdmin, loadViewer } from '../../policy/viewer.ts';
import { requireAuth } from '../identity/session.ts';

const ReasonInput = z.strictObject({ rationale: z.string().trim().min(3).max(1000) });

export async function adminRoutes(app: FastifyInstance, { pool }: AppDeps): Promise<void> {
  async function setStatus(
    actorId: string,
    targetId: string,
    status: 'active' | 'suspended',
    rationale: string,
  ) {
    if (actorId === targetId) throw forbidden('Administrators cannot change their own status');
    return withTx(pool, async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 AND status <> 'deleted'`,
        [targetId, status],
      );
      if (!rowCount) throw notFound('User');
      if (status === 'suspended') {
        // Suspension takes effect immediately: existing sessions stop working.
        await tx.query(
          'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [targetId],
        );
        await tx.query(
          `UPDATE connection_requests SET state = 'cancelled', responded_at = now()
            WHERE state = 'pending' AND (requester_id = $1 OR addressee_id = $1)`,
          [targetId],
        );
      }
      await audit(tx, {
        actorId,
        action: status === 'suspended' ? 'user.suspended' : 'user.reinstated',
        subjectType: 'user',
        subjectId: targetId,
        metadata: { rationale },
      });
      return { id: targetId, status };
    });
  }

  app.post('/api/admin/users/:id/suspend', async (req) => {
    const { userId } = requireAuth(req);
    assertAdmin(await loadViewer(pool, userId));
    const { id } = parse(IdParam, req.params);
    const { rationale } = parse(ReasonInput, req.body);
    return setStatus(userId, id, 'suspended', rationale);
  });

  app.post('/api/admin/users/:id/reinstate', async (req) => {
    const { userId } = requireAuth(req);
    assertAdmin(await loadViewer(pool, userId));
    const { id } = parse(IdParam, req.params);
    const { rationale } = parse(ReasonInput, req.body);
    return setStatus(userId, id, 'active', rationale);
  });
}
