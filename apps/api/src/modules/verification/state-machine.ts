import type { VerificationState } from '@alumni/shared';

export type VerificationAction =
  'auto_verify' | 'start_review' | 'verify' | 'reject' | 'revoke' | 'appeal';

/** Legal transitions. Anything not listed is rejected with a CONFLICT. */
const TRANSITIONS: Record<
  VerificationAction,
  Partial<Record<VerificationState, VerificationState>>
> = {
  auto_verify: { pending: 'verified' },
  start_review: { pending: 'under_review', appealed: 'under_review' },
  verify: { pending: 'verified', under_review: 'verified', appealed: 'verified' },
  reject: { pending: 'rejected', under_review: 'rejected', appealed: 'rejected' },
  revoke: { verified: 'revoked' },
  appeal: { rejected: 'appealed' },
};

export function nextState(
  from: VerificationState,
  action: VerificationAction,
): VerificationState | null {
  return TRANSITIONS[action][from] ?? null;
}
