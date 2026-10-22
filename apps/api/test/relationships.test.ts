import { describe, expect, it } from 'vitest';
import { call, makeAdmin, makeMember, useTestApp, type Session } from './helpers.ts';

const ctx = useTestApp();

async function pair(): Promise<{ student: Session; alum: Session; admin: Session }> {
  const admin = await makeAdmin(ctx);
  const student = await makeMember(ctx, {
    email: 's@students.uni.edu',
    name: 'Student',
    role: 'student',
  });
  const alum = await makeMember(ctx, { email: 'alum@gmail.com', name: 'Alum' }, admin);
  return { student, alum, admin };
}

const send = (from: Session, to: Session, message?: string) =>
  call(ctx.app, 'POST', '/api/connections/requests', {
    session: from,
    body: { addresseeId: to.userId, message },
  });
const act = (s: Session, id: string, action: 'accept' | 'decline' | 'cancel') =>
  call(ctx.app, 'POST', `/api/connections/requests/${id}/${action}`, { session: s });

async function counts() {
  const { rows } = await ctx.pool.query(`SELECT
    (SELECT count(*)::int FROM connections) AS connections,
    (SELECT count(*)::int FROM connection_requests WHERE state = 'pending') AS pending`);
  return rows[0] as { connections: number; pending: number };
}

describe('connection workflow', () => {
  it('student requests, alumnus accepts, both see the connection', async () => {
    const { student, alum } = await pair();
    const res = await send(student, alum, 'Hi! I would love advice on systems roles.');
    expect(res.statusCode).toBe(201);
    const incoming = (
      await call(ctx.app, 'GET', '/api/connections/requests', { session: alum })
    ).json();
    expect(incoming.requests).toHaveLength(1);
    expect(incoming.requests[0].other.displayName).toBe('Student');

    expect((await act(alum, res.json().request.id, 'accept')).statusCode).toBe(200);
    for (const s of [student, alum]) {
      const list = (await call(ctx.app, 'GET', '/api/connections', { session: s })).json();
      expect(list.connections).toHaveLength(1);
    }
    const profile = (
      await call(ctx.app, 'GET', `/api/profiles/${alum.userId}`, { session: student })
    ).json();
    expect(profile.relationship).toBe('connected');
    expect(await counts()).toEqual({ connections: 1, pending: 0 });
  });

  it('is idempotent for duplicate sends and accepts a reciprocal request', async () => {
    const { student, alum } = await pair();
    const first = await send(student, alum);
    const dup = await send(student, alum);
    expect(dup.statusCode).toBe(200);
    expect(dup.json()).toMatchObject({
      outcome: 'existing',
      request: { id: first.json().request.id },
    });
    const reciprocal = await send(alum, student);
    expect(reciprocal.json().outcome).toBe('accepted_reciprocal');
    expect(await counts()).toEqual({ connections: 1, pending: 0 });
    expect((await send(student, alum)).statusCode).toBe(409);
  });

  it('creates exactly one connection when both sides send at the same time', async () => {
    for (let round = 0; round < 5; round++) {
      await ctx.pool.query('TRUNCATE connections, connection_requests CASCADE');
      const { student, alum } = round === 0 ? await pair() : await existing();
      const results = await Promise.all([
        send(student, alum),
        send(alum, student),
        send(student, alum),
      ]);
      // A send that lands after the pair is connected is told so (409); nothing errors otherwise.
      for (const r of results) expect([200, 201, 409]).toContain(r.statusCode);
      expect(
        results.filter((r) => r.statusCode === 409).every((r) => /already connected/.test(r.body)),
      ).toBe(true);
      expect(await counts()).toEqual({ connections: 1, pending: 0 });
    }
  });

  it('lets exactly one of a concurrent accept and cancel win', async () => {
    const { student, alum } = await pair();
    for (let round = 0; round < 5; round++) {
      await ctx.pool.query('TRUNCATE connections, connection_requests CASCADE');
      const id = (await send(student, alum)).json().request.id;
      const [a, c] = await Promise.all([act(alum, id, 'accept'), act(student, id, 'cancel')]);
      expect([a.statusCode, c.statusCode].sort()).toEqual([200, 409]);
      const { connections } = await counts();
      expect(connections).toBe(a.statusCode === 200 ? 1 : 0);
    }
  });

  it('enforces who may act on a request', async () => {
    const { student, alum, admin } = await pair();
    const outsider = await makeMember(ctx, { email: 'out@gmail.com', name: 'Outsider' }, admin);
    const id = (await send(student, alum)).json().request.id;
    expect((await act(outsider, id, 'accept')).statusCode).toBe(404);
    expect((await act(student, id, 'accept')).statusCode).toBe(403);
    expect((await act(alum, id, 'cancel')).statusCode).toBe(403);
    expect((await act(alum, id, 'decline')).statusCode).toBe(200);
    expect((await act(alum, id, 'accept')).statusCode).toBe(409);
  });

  it('cannot request hidden or unverified members', async () => {
    const { student, admin } = await pair();
    const hidden = await makeMember(
      ctx,
      { email: 'h@gmail.com', name: 'Hidden', profile: { discoverability: 'hidden' } },
      admin,
    );
    const pending = await makeMember(ctx, { email: 'p@gmail.com', name: 'Pending', verify: false });
    expect((await send(student, hidden)).statusCode).toBe(404);
    expect((await send(student, pending)).statusCode).toBe(404);
    expect((await send(pending, student)).statusCode).toBe(403);
  });

  it('blocking cancels requests, removes connections and prevents new contact', async () => {
    const { student, alum } = await pair();
    const id = (await send(student, alum)).json().request.id;
    await act(alum, id, 'accept');
    await send(alum, student); // already connected -> 409, no pending created

    expect(
      (
        await call(ctx.app, 'POST', '/api/blocks', {
          session: alum,
          body: { userId: student.userId },
        })
      ).statusCode,
    ).toBe(204);
    expect(await counts()).toEqual({ connections: 0, pending: 0 });
    expect((await send(student, alum)).statusCode).toBe(404);
    expect((await send(alum, student)).statusCode).toBe(404);
    expect(
      (await call(ctx.app, 'GET', `/api/profiles/${alum.userId}`, { session: student })).statusCode,
    ).toBe(404);

    await call(ctx.app, 'DELETE', `/api/blocks/${student.userId}`, { session: alum });
    expect((await send(student, alum)).statusCode).toBe(201);
  });

  it('a pending request from a since-revoked member cannot be accepted', async () => {
    const { student, alum, admin } = await pair();
    const id = (await send(alum, student)).json().request.id;
    const { rows } = await ctx.pool.query(
      'SELECT vc.id FROM verification_cases vc JOIN affiliation_claims ac ON ac.id = vc.claim_id WHERE ac.user_id = $1',
      [alum.userId],
    );
    await call(ctx.app, 'POST', `/api/admin/verification-cases/${rows[0].id}/decision`, {
      session: admin,
      body: { decision: 'revoke', rationale: 'impersonation report confirmed' },
    });
    expect((await act(student, id, 'accept')).statusCode).toBe(404);
    expect(await counts()).toEqual({ connections: 0, pending: 1 });
  });
});

async function existing(): Promise<{ student: Session; alum: Session }> {
  const { login } = await import('./helpers.ts');
  return {
    student: await login(ctx.app, 's@students.uni.edu'),
    alum: await login(ctx.app, 'alum@gmail.com'),
  };
}
