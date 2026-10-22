import { describe, expect, it } from 'vitest';
import { nextState } from './state-machine.ts';

describe('verification state machine', () => {
  it('allows the documented review paths', () => {
    expect(nextState('pending', 'auto_verify')).toBe('verified');
    expect(nextState('pending', 'start_review')).toBe('under_review');
    expect(nextState('under_review', 'verify')).toBe('verified');
    expect(nextState('under_review', 'reject')).toBe('rejected');
    expect(nextState('rejected', 'appeal')).toBe('appealed');
    expect(nextState('appealed', 'verify')).toBe('verified');
    expect(nextState('verified', 'revoke')).toBe('revoked');
  });

  it('rejects illegal transitions', () => {
    expect(nextState('verified', 'verify')).toBeNull();
    expect(nextState('rejected', 'verify')).toBeNull(); // must be appealed first
    expect(nextState('under_review', 'auto_verify')).toBeNull(); // automation never overrides a human review
    expect(nextState('revoked', 'verify')).toBeNull();
    expect(nextState('revoked', 'appeal')).toBeNull();
    expect(nextState('pending', 'revoke')).toBeNull();
    expect(nextState('verified', 'appeal')).toBeNull();
  });
});
