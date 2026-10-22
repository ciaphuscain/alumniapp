import type { VerificationState } from '@alumni/shared';
import type { Queryable } from '../db/client.ts';
import { forbidden } from '../lib/errors.ts';

export interface Viewer {
  userId: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  verificationState: VerificationState | null;
}

export async function loadViewer(db: Queryable, userId: string): Promise<Viewer> {
  const { rows } = await db.query<{
    email: string;
    email_verified: boolean;
    is_admin: boolean;
    state: VerificationState | null;
  }>(
    `SELECT u.email, u.email_verified_at IS NOT NULL AS email_verified,
            EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin,
            vc.state
       FROM users u
       LEFT JOIN affiliation_claims ac ON ac.user_id = u.id
       LEFT JOIN verification_cases vc ON vc.claim_id = ac.id
      WHERE u.id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) throw forbidden();
  return {
    userId,
    email: r.email,
    emailVerified: r.email_verified,
    isAdmin: r.is_admin,
    verificationState: r.state,
  };
}

/** Members may use the network (directory, profiles, connections) only once their affiliation is verified. */
export function assertVerifiedMember(v: Viewer): void {
  if (!v.emailVerified) throw forbidden('Verify your email address first');
  if (v.verificationState !== 'verified') {
    throw forbidden('Your university affiliation must be verified first');
  }
}

export function assertAdmin(v: Viewer): void {
  if (!v.isAdmin) throw forbidden();
}
