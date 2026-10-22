import type { Queryable } from '../db/client.ts';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown>;
}

/** Call with the transaction client so the audit row commits or rolls back with the change. */
export async function audit(db: Queryable, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (actor_id, action, subject_type, subject_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [e.actorId, e.action, e.subjectType, e.subjectId, JSON.stringify(e.metadata ?? {})],
  );
}
