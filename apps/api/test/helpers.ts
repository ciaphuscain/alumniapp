import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type pg from 'pg';
import { buildApp } from '../src/app.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { createPool } from '../src/db/client.ts';
import { MemoryMailer } from '../src/lib/mailer.ts';
import { TEST_DATABASE_URL } from './global-setup.ts';

export const STUDENT_DOMAIN = 'students.uni.edu';
export const FACULTY_DOMAIN = 'uni.edu';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    VERIFICATION_EMAIL_DOMAINS: `student:${STUDENT_DOMAIN},faculty:${FACULTY_DOMAIN}`,
    RATE_LIMIT_AUTH_PER_MIN: '10000',
    RATE_LIMIT_SEARCH_PER_MIN: '10000',
    ...overrides,
  });
}

export interface TestCtx {
  app: FastifyInstance;
  pool: pg.Pool;
  mailer: MemoryMailer;
}

/** Builds one app per test file and empties every table before each test. */
export function useTestApp(overrides: Record<string, string> = {}): TestCtx {
  const ctx = {} as TestCtx;
  beforeAll(async () => {
    const config = testConfig(overrides);
    ctx.pool = createPool(config.databaseUrl);
    ctx.mailer = new MemoryMailer();
    ctx.app = await buildApp({ config, pool: ctx.pool, mailer: ctx.mailer });
  });
  beforeEach(async () => {
    const { rows } = await ctx.pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
    );
    await ctx.pool.query(
      `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    ctx.mailer.sent.length = 0;
  });
  afterAll(async () => {
    await ctx.app?.close();
    await ctx.pool?.end();
  });
  return ctx;
}

export interface Session {
  userId: string;
  email: string;
  cookie: string;
}

export async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  opts: { session?: Session | null; body?: unknown; csrf?: boolean } = {},
): Promise<LightMyRequestResponse> {
  const headers: Record<string, string> = {};
  if (opts.csrf !== false) headers['x-requested-with'] = 'alumniapp';
  if (opts.session) headers.cookie = opts.session.cookie;
  return app.inject({ method, url, headers, payload: opts.body as object | undefined });
}

export function tokenFromMail(mailer: MemoryMailer, email: string): string {
  const msg = mailer.latestFor(email);
  const token = msg?.text.match(/token=([\w-]+)/)?.[1];
  if (!token) throw new Error(`no verification token mailed to ${email}`);
  return token;
}

export async function login(
  app: FastifyInstance,
  email: string,
  password = 'correct horse battery',
): Promise<Session> {
  const res = await call(app, 'POST', '/api/auth/login', { body: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const raw = res.cookies.find((c) => c.name === 'sid');
  const cookie = `sid=${raw!.value}`;
  const me = await call(app, 'GET', '/api/me', { session: { cookie } as Session });
  return { userId: me.json().id, email, cookie };
}

/** Registers, verifies the email and signs in. */
export async function signUp(
  ctx: TestCtx,
  email: string,
  displayName = email.split('@')[0]!,
): Promise<Session> {
  const reg = await call(ctx.app, 'POST', '/api/auth/register', {
    body: { email, password: 'correct horse battery', displayName },
  });
  if (reg.statusCode !== 202) throw new Error(`register failed: ${reg.body}`);
  const ver = await call(ctx.app, 'POST', '/api/auth/verify-email', {
    body: { token: tokenFromMail(ctx.mailer, email) },
  });
  if (ver.statusCode !== 200) throw new Error(`verify failed: ${ver.body}`);
  return login(ctx.app, email);
}

export async function makeAdmin(ctx: TestCtx, email = 'admin@ops.example'): Promise<Session> {
  const s = await signUp(ctx, email, 'Admin');
  await ctx.pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [s.userId]);
  return s;
}

export interface MemberSpec {
  email: string;
  name?: string;
  role?: 'student' | 'alumni' | 'faculty';
  department?: string;
  graduationYear?: number;
  profile?: Record<string, unknown>;
  /** Verify via an admin when the email domain does not auto-verify (default true). */
  verify?: boolean;
}

/** Creates a member with claim and profile, verified through the real API paths. */
export async function makeMember(
  ctx: TestCtx,
  spec: MemberSpec,
  admin?: Session,
): Promise<Session> {
  const s = await signUp(ctx, spec.email, spec.name);
  const claim = await call(ctx.app, 'PUT', '/api/me/affiliation', {
    session: s,
    body: {
      role: spec.role ?? 'alumni',
      department: spec.department ?? 'Computer Science',
      graduationYear: spec.graduationYear ?? (spec.role === 'faculty' ? undefined : 2015),
    },
  });
  if (claim.statusCode !== 200) throw new Error(`claim failed: ${claim.body}`);
  if (claim.json().verificationState !== 'verified' && spec.verify !== false) {
    const reviewer =
      admin ?? (await makeAdmin(ctx, `admin-${Math.random().toString(36).slice(2)}@ops.example`));
    const caseId = (
      await ctx.pool.query(
        'SELECT vc.id FROM verification_cases vc JOIN affiliation_claims ac ON ac.id = vc.claim_id WHERE ac.user_id = $1',
        [s.userId],
      )
    ).rows[0].id;
    const d = await call(ctx.app, 'POST', `/api/admin/verification-cases/${caseId}/decision`, {
      session: reviewer,
      body: { decision: 'verify', rationale: 'matched alumni register' },
    });
    if (d.statusCode !== 200) throw new Error(`verify decision failed: ${d.body}`);
  }
  const prof = await call(ctx.app, 'PUT', '/api/me/profile', {
    session: s,
    body: { displayName: spec.name ?? spec.email.split('@')[0], ...spec.profile },
  });
  if (prof.statusCode !== 200) throw new Error(`profile failed: ${prof.body}`);
  return s;
}
