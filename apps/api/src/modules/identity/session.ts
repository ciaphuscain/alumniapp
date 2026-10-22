import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../../config.ts';
import type { Queryable } from '../../db/client.ts';
import { hashToken, newToken } from '../../lib/tokens.ts';
import { unauthenticated } from '../../lib/errors.ts';

export const SESSION_COOKIE = 'sid';

export interface AuthContext {
  userId: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/** Resolves the session cookie to an active user, or null. Suspended/deleted users have no session. */
export async function resolveSession(
  db: Queryable,
  token: string | undefined,
): Promise<AuthContext | null> {
  if (!token) return null;
  const { rows } = await db.query<{ session_id: string; user_id: string }>(
    `SELECT s.id AS session_id, u.id AS user_id
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND u.status = 'active'`,
    [hashToken(token)],
  );
  const row = rows[0];
  return row ? { userId: row.user_id, sessionId: row.session_id } : null;
}

export async function createSession(
  db: Queryable,
  config: Config,
  reply: FastifyReply,
  userId: string,
): Promise<void> {
  const token = newToken();
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + $3 * interval '1 millisecond')`,
    [userId, hashToken(token), config.sessionTtlMs],
  );
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}
