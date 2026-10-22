import type { FastifyInstance } from 'fastify';
import { hash, verify } from '@node-rs/argon2';
import { LoginInput, RegisterInput, VerifyEmailInput, type MeResponse } from '@alumni/shared';
import type { AppDeps } from '../../app.ts';
import { withTx } from '../../db/client.ts';
import { AppError, forbidden } from '../../lib/errors.ts';
import { parse } from '../../lib/http.ts';
import { hashToken, newToken } from '../../lib/tokens.ts';
import { audit } from '../../lib/audit.ts';
import { SESSION_COOKIE, createSession, requireAuth } from './session.ts';
import { evaluateAutoVerification } from '../verification/service.ts';

// Verified against when the email is unknown, so failed logins take similar time either way.
const DUMMY_HASH = await hash('timing-equalizer-not-a-real-password');

export async function identityRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { pool, config, mailer } = deps;
  const authLimit = { rateLimit: { max: config.rateLimits.authPerMin, timeWindow: '1 minute' } };

  async function sendVerificationEmail(userId: string, email: string): Promise<void> {
    const token = newToken();
    await pool.query(
      `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'verify_email', $2, now() + $3 * interval '1 millisecond')`,
      [userId, hashToken(token), config.emailTokenTtlMs],
    );
    await mailer.send({
      to: email,
      subject: 'Verify your University Alumni Network email',
      text: `Open this link to verify your email: ${config.appBaseUrl}/verify-email?token=${token}`,
    });
  }

  /**
   * Always answers 202 so the endpoint cannot be used to discover registered addresses;
   * an existing account owner receives an email instead of a second account.
   */
  app.post('/api/auth/register', { config: authLimit }, async (req, reply) => {
    const input = parse(RegisterInput, req.body);
    const passwordHash = await hash(input.password);
    const created = await withTx(pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [input.email, passwordHash],
      );
      const id = rows[0]?.id;
      if (!id) return null;
      await tx.query('INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)', [
        id,
        input.displayName,
      ]);
      await audit(tx, {
        actorId: id,
        action: 'user.registered',
        subjectType: 'user',
        subjectId: id,
      });
      return id;
    });
    if (created) {
      await sendVerificationEmail(created, input.email);
    } else {
      await mailer.send({
        to: input.email,
        subject: 'You already have an account',
        text: `Someone tried to register with this address. If it was you, sign in at ${config.appBaseUrl}/login.`,
      });
    }
    return reply.code(202).send({ status: 'check_email' });
  });

  app.post('/api/auth/verify-email', { config: authLimit }, async (req) => {
    const { token } = parse(VerifyEmailInput, req.body);
    return withTx(pool, async (tx) => {
      const { rows } = await tx.query<{ user_id: string }>(
        `UPDATE email_tokens SET used_at = now()
          WHERE token_hash = $1 AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > now()
          RETURNING user_id`,
        [hashToken(token)],
      );
      const userId = rows[0]?.user_id;
      if (!userId) throw new AppError('VALIDATION', 'This link is invalid or has expired');
      await tx.query(
        `UPDATE users SET email_verified_at = coalesce(email_verified_at, now()), updated_at = now() WHERE id = $1`,
        [userId],
      );
      await audit(tx, {
        actorId: userId,
        action: 'user.email_verified',
        subjectType: 'user',
        subjectId: userId,
      });
      await evaluateAutoVerification(tx, config, userId);
      return { status: 'verified' };
    });
  });

  app.post('/api/auth/resend-verification', { config: authLimit }, async (req, reply) => {
    const { userId } = requireAuth(req);
    const { rows } = await pool.query<{ email: string; verified: boolean }>(
      'SELECT email, email_verified_at IS NOT NULL AS verified FROM users WHERE id = $1',
      [userId],
    );
    const user = rows[0];
    if (user && !user.verified) await sendVerificationEmail(userId, user.email);
    return reply.code(202).send({ status: 'check_email' });
  });

  app.post('/api/auth/login', { config: authLimit }, async (req, reply) => {
    const input = parse(LoginInput, req.body);
    const { rows } = await pool.query<{ id: string; password_hash: string; status: string }>(
      'SELECT id, password_hash, status FROM users WHERE email = $1',
      [input.email],
    );
    const user = rows[0];
    const ok = await verify(user?.password_hash ?? DUMMY_HASH, input.password);
    if (!user || !ok) throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect');
    if (user.status !== 'active') throw forbidden('This account is not active');
    await createSession(pool, config, reply, user.id);
    return { status: 'signed_in' };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) {
      await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [
        req.auth.sessionId,
      ]);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { status: 'signed_out' };
  });

  app.get('/api/me', async (req): Promise<MeResponse> => {
    const { userId } = requireAuth(req);
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.status, u.email_verified_at IS NOT NULL AS email_verified,
              EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin,
              EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id) AS has_profile,
              ac.role, ac.department, ac.degree, ac.graduation_year, vc.state, vc.method
         FROM users u
         LEFT JOIN affiliation_claims ac ON ac.user_id = u.id
         LEFT JOIN verification_cases vc ON vc.claim_id = ac.id
        WHERE u.id = $1`,
      [userId],
    );
    const r = rows[0];
    return {
      id: r.id,
      email: r.email,
      emailVerified: r.email_verified,
      isAdmin: r.is_admin,
      status: r.status,
      hasProfile: r.has_profile,
      affiliation: r.role
        ? {
            role: r.role,
            department: r.department,
            degree: r.degree,
            graduationYear: r.graduation_year,
            verificationState: r.state,
            verificationMethod: r.method,
          }
        : null,
    };
  });
}
