import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { call, login, signUp, testConfig, tokenFromMail, useTestApp } from './helpers.ts';

const ctx = useTestApp();
const body = {
  email: 'asha@students.uni.edu',
  password: 'correct horse battery',
  displayName: 'Asha Rao',
};

describe('identity', () => {
  it('registers, verifies email once, and signs in', async () => {
    const reg = await call(ctx.app, 'POST', '/api/auth/register', { body });
    expect(reg.statusCode).toBe(202);
    const token = tokenFromMail(ctx.mailer, body.email);

    const first = await call(ctx.app, 'POST', '/api/auth/verify-email', { body: { token } });
    expect(first.statusCode).toBe(200);
    const replay = await call(ctx.app, 'POST', '/api/auth/verify-email', { body: { token } });
    expect(replay.statusCode).toBe(400);

    const s = await login(ctx.app, body.email);
    const me = await call(ctx.app, 'GET', '/api/me', { session: s });
    expect(me.json()).toMatchObject({
      email: body.email,
      emailVerified: true,
      isAdmin: false,
      affiliation: null,
    });
  });

  it('does not reveal whether an email is already registered', async () => {
    await call(ctx.app, 'POST', '/api/auth/register', { body });
    const again = await call(ctx.app, 'POST', '/api/auth/register', {
      body: { ...body, displayName: 'Imposter' },
    });
    expect(again.statusCode).toBe(202);
    expect(ctx.mailer.latestFor(body.email)?.subject).toMatch(/already have an account/);
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM users');
    expect(rows[0].n).toBe(1);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    await signUp(ctx, body.email);
    const wrong = await call(ctx.app, 'POST', '/api/auth/login', {
      body: { email: body.email, password: 'nope' },
    });
    const unknown = await call(ctx.app, 'POST', '/api/auth/login', {
      body: { email: 'nobody@uni.edu', password: 'nope' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('rejects unknown fields such as a forged role at registration', async () => {
    const res = await call(ctx.app, 'POST', '/api/auth/register', {
      body: { ...body, isAdmin: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });

  it('requires the anti-CSRF header on state-changing requests', async () => {
    const res = await call(ctx.app, 'POST', '/api/auth/register', { body, csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it('revokes the session on logout', async () => {
    const s = await signUp(ctx, body.email);
    expect((await call(ctx.app, 'POST', '/api/auth/logout', { session: s })).statusCode).toBe(200);
    expect((await call(ctx.app, 'GET', '/api/me', { session: s })).statusCode).toBe(401);
  });

  it('rate-limits login attempts', async () => {
    const app = await buildApp({
      config: testConfig({ RATE_LIMIT_AUTH_PER_MIN: '3' }),
      pool: ctx.pool,
      mailer: ctx.mailer,
    });
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const r = await call(app, 'POST', '/api/auth/login', {
        body: { email: 'x@uni.edu', password: 'guess' },
      });
      codes.push(r.statusCode);
    }
    await app.close();
    expect(codes).toEqual([401, 401, 401, 429, 429]);
  });
});
