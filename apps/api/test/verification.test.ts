import { describe, expect, it } from 'vitest';
import { call, makeAdmin, signUp, useTestApp } from './helpers.ts';

const ctx = useTestApp();
const claim = { role: 'alumni', department: 'Mechanical Engineering', graduationYear: 2009 };

async function caseIdFor(userId: string): Promise<string> {
  const { rows } = await ctx.pool.query(
    'SELECT vc.id FROM verification_cases vc JOIN affiliation_claims ac ON ac.id = vc.claim_id WHERE ac.user_id = $1',
    [userId],
  );
  return rows[0].id;
}

describe('affiliation verification', () => {
  it('auto-verifies a student who owns a student-domain mailbox', async () => {
    const s = await signUp(ctx, 'meera@students.uni.edu');
    const res = await call(ctx.app, 'PUT', '/api/me/affiliation', {
      session: s,
      body: { role: 'student', department: 'Physics', graduationYear: 2027 },
    });
    expect(res.json()).toEqual({ verificationState: 'verified' });
    const me = (await call(ctx.app, 'GET', '/api/me', { session: s })).json();
    expect(me.affiliation).toMatchObject({
      verificationState: 'verified',
      verificationMethod: 'institutional_email',
    });
  });

  it('does not let a student mailbox prove a faculty or alumni claim', async () => {
    const s = await signUp(ctx, 'ravi@students.uni.edu');
    const res = await call(ctx.app, 'PUT', '/api/me/affiliation', {
      session: s,
      body: { role: 'faculty', department: 'Physics' },
    });
    expect(res.json()).toEqual({ verificationState: 'pending' });
  });

  it('requires a verified email before claiming affiliation', async () => {
    await call(ctx.app, 'POST', '/api/auth/register', {
      body: { email: 'new@gmail.com', password: 'correct horse battery', displayName: 'New' },
    });
    const login = await call(ctx.app, 'POST', '/api/auth/login', {
      body: { email: 'new@gmail.com', password: 'correct horse battery' },
    });
    const cookie = `sid=${login.cookies.find((c) => c.name === 'sid')!.value}`;
    const res = await call(ctx.app, 'PUT', '/api/me/affiliation', {
      session: { cookie, userId: '', email: '' },
      body: claim,
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects attempts to set verification state from the client', async () => {
    const s = await signUp(ctx, 'sneaky@gmail.com');
    const res = await call(ctx.app, 'PUT', '/api/me/affiliation', {
      session: s,
      body: { ...claim, verificationState: 'verified' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('runs reject -> appeal -> verify with an audit trail', async () => {
    const admin = await makeAdmin(ctx);
    const s = await signUp(ctx, 'old.grad@gmail.com');
    await call(ctx.app, 'PUT', '/api/me/affiliation', { session: s, body: claim });
    const id = await caseIdFor(s.userId);

    const queue = (
      await call(ctx.app, 'GET', '/api/admin/verification-cases', { session: admin })
    ).json();
    expect(queue.cases.map((c: { id: string }) => c.id)).toContain(id);

    const decide = (decision: string) =>
      call(ctx.app, 'POST', `/api/admin/verification-cases/${id}/decision`, {
        session: admin,
        body: { decision, rationale: `admin ${decision}` },
      });
    expect((await decide('reject')).json().verificationState).toBe('rejected');
    expect((await decide('verify')).statusCode).toBe(409); // must be appealed first

    const resubmit = await call(ctx.app, 'PUT', '/api/me/affiliation', { session: s, body: claim });
    expect(resubmit.statusCode).toBe(409);
    const appeal = await call(ctx.app, 'POST', '/api/me/affiliation/appeal', {
      session: s,
      body: { note: 'Attaching my 2009 convocation certificate number' },
    });
    expect(appeal.json().verificationState).toBe('appealed');
    expect((await decide('verify')).json().verificationState).toBe('verified');
    expect((await decide('verify')).statusCode).toBe(409);

    const { rows: events } = await ctx.pool.query(
      'SELECT from_state, to_state FROM verification_events WHERE case_id = $1 ORDER BY id',
      [id],
    );
    expect(events.map((e) => `${e.from_state}->${e.to_state}`)).toEqual([
      'null->pending',
      'pending->rejected',
      'rejected->appealed',
      'appealed->verified',
    ]);
    const { rows: audits } = await ctx.pool.query(
      `SELECT action, actor_id FROM audit_events WHERE subject_type = 'verification_case' ORDER BY id`,
    );
    expect(audits.map((a) => a.action)).toEqual([
      'verification.reject',
      'verification.appeal',
      'verification.verify',
    ]);
    expect(audits[0].actor_id).toBe(admin.userId);
  });

  it('forbids non-admins from deciding cases and admins from deciding their own', async () => {
    const s = await signUp(ctx, 'someone@gmail.com');
    await call(ctx.app, 'PUT', '/api/me/affiliation', { session: s, body: claim });
    const id = await caseIdFor(s.userId);
    const self = await call(ctx.app, 'POST', `/api/admin/verification-cases/${id}/decision`, {
      session: s,
      body: { decision: 'verify', rationale: 'trust me' },
    });
    expect(self.statusCode).toBe(403);
    expect(
      (await call(ctx.app, 'GET', '/api/admin/verification-cases', { session: s })).statusCode,
    ).toBe(403);

    const admin = await makeAdmin(ctx);
    await call(ctx.app, 'PUT', '/api/me/affiliation', { session: admin, body: claim });
    const own = await call(
      ctx.app,
      'POST',
      `/api/admin/verification-cases/${await caseIdFor(admin.userId)}/decision`,
      {
        session: admin,
        body: { decision: 'verify', rationale: 'it me' },
      },
    );
    expect(own.statusCode).toBe(403);
  });

  it('serializes concurrent conflicting decisions', async () => {
    const [a1, a2] = [
      await makeAdmin(ctx, 'a1@ops.example'),
      await makeAdmin(ctx, 'a2@ops.example'),
    ];
    const s = await signUp(ctx, 'contested@gmail.com');
    await call(ctx.app, 'PUT', '/api/me/affiliation', { session: s, body: claim });
    const id = await caseIdFor(s.userId);
    const results = await Promise.all([
      call(ctx.app, 'POST', `/api/admin/verification-cases/${id}/decision`, {
        session: a1,
        body: { decision: 'verify', rationale: 'looks right' },
      }),
      call(ctx.app, 'POST', `/api/admin/verification-cases/${id}/decision`, {
        session: a2,
        body: { decision: 'reject', rationale: 'looks wrong' },
      }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const { rows } = await ctx.pool.query(
      'SELECT count(*)::int AS n FROM verification_events WHERE case_id = $1',
      [id],
    );
    expect(rows[0].n).toBe(2); // created + exactly one decision
  });
});
