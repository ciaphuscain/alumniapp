import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { ErrorCode, type ApiErrorBody } from '@alumni/shared';
import type pg from 'pg';
import type { Config } from './config.ts';
import { AppError } from './lib/errors.ts';
import type { Mailer, MemoryMailer } from './lib/mailer.ts';
import { SESSION_COOKIE, resolveSession } from './modules/identity/session.ts';
import { identityRoutes } from './modules/identity/routes.ts';
import { verificationRoutes } from './modules/verification/routes.ts';
import { profileRoutes } from './modules/profiles/routes.ts';
import { directoryRoutes } from './modules/directory/routes.ts';
import { relationshipRoutes } from './modules/relationships/routes.ts';
import { adminRoutes } from './modules/admin/routes.ts';

export interface AppDeps {
  config: Config;
  pool: pg.Pool;
  mailer: Mailer;
}

/** Header every state-changing request must carry; cross-site forms cannot set it. */
export const CSRF_HEADER = 'x-requested-with';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const errorBody = (code: ErrorCode, message: string, details?: unknown): ApiErrorBody => ({
  error: details === undefined ? { code, message } : { code, message, details },
});

export async function buildApp(
  deps: AppDeps,
  opts: { logger?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger
      ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] }
      : false,
    trustProxy: deps.config.env === 'production',
    bodyLimit: 64 * 1024,
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      ...errorBody(ErrorCode.RATE_LIMITED, `Too many requests; retry in ${ctx.after}`),
    }),
  });

  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req) => {
    if (!SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== 'alumniapp') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Missing anti-CSRF header');
    }
    req.auth = await resolveSession(deps.pool, req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send(errorBody(err.code, err.message, err.details));
    }
    if (err instanceof z.ZodError) {
      return reply.code(400).send(errorBody(ErrorCode.VALIDATION, 'Invalid request'));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) {
      return reply.code(429).send(errorBody(ErrorCode.RATE_LIMITED, 'Too many requests'));
    }
    if (status && status >= 400 && status < 500) {
      return reply.code(400).send(errorBody(ErrorCode.VALIDATION, (err as Error).message));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send(errorBody(ErrorCode.INTERNAL, 'Something went wrong'));
  });
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send(errorBody(ErrorCode.NOT_FOUND, 'Not found')),
  );

  app.get('/api/health', async () => {
    await deps.pool.query('SELECT 1');
    return { status: 'ok' };
  });

  await identityRoutes(app, deps);
  await verificationRoutes(app, deps);
  await profileRoutes(app, deps);
  await directoryRoutes(app, deps);
  await relationshipRoutes(app, deps);
  await adminRoutes(app, deps);

  if (deps.config.devMailbox) {
    // Development-only: lets a local developer or the e2e suite read verification emails.
    const mailer = deps.mailer as MemoryMailer;
    app.get('/api/dev/mailbox', async (req) => {
      const { email } = z.object({ email: z.string() }).parse(req.query);
      return { message: mailer.latestFor(email) ?? null };
    });
  }

  return app;
}
