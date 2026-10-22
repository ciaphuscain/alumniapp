import { z } from 'zod';
import type { AffiliationRole } from '@alumni/shared';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(3000),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  /** e.g. "student:students.university.edu,faculty:university.edu,alumni:alumni.university.edu" */
  VERIFICATION_EMAIL_DOMAINS: z.string().default(''),
  COOKIE_SECURE: bool.default(false),
  DEV_MAILBOX: bool.default(false),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SEARCH_PER_MIN: z.coerce.number().int().positive().default(60),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  databaseUrl: string;
  port: number;
  appBaseUrl: string;
  /** Email domain (lowercase) -> the affiliation role that owning such a mailbox proves. */
  verificationEmailDomains: Map<string, AffiliationRole>;
  cookieSecure: boolean;
  devMailbox: boolean;
  rateLimits: { authPerMin: number; searchPerMin: number };
  sessionTtlMs: number;
  emailTokenTtlMs: number;
}

export function parseDomainMap(raw: string): Map<string, AffiliationRole> {
  const map = new Map<string, AffiliationRole>();
  for (const entry of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [role, domain] = entry.split(':').map((s) => s.trim().toLowerCase());
    if (!domain || (role !== 'student' && role !== 'alumni' && role !== 'faculty')) {
      throw new Error(
        `Invalid VERIFICATION_EMAIL_DOMAINS entry: "${entry}" (expected role:domain)`,
      );
    }
    map.set(domain, role);
  }
  return map;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env);
  if (e.NODE_ENV === 'production' && e.DEV_MAILBOX) {
    throw new Error('DEV_MAILBOX must not be enabled in production');
  }
  return {
    env: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    appBaseUrl: e.APP_BASE_URL,
    verificationEmailDomains: parseDomainMap(e.VERIFICATION_EMAIL_DOMAINS),
    cookieSecure: e.COOKIE_SECURE,
    devMailbox: e.DEV_MAILBOX,
    rateLimits: {
      authPerMin: e.RATE_LIMIT_AUTH_PER_MIN,
      searchPerMin: e.RATE_LIMIT_SEARCH_PER_MIN,
    },
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    emailTokenTtlMs: 24 * 60 * 60 * 1000,
  };
}
