# University Alumni Network

A private network for one university's students, alumni and faculty. The core product is
**trusted discovery**: find the right person by department, batch, employer, skill or research
area, and make consented contact with them.

This repository currently contains the first vertical slice:

> register → verify email → claim university affiliation → verified (automatically or by an
> administrator) → build a profile → search the directory → send a connection request → accept

Messaging, notifications, mentorship, communities and feeds come next; see
[docs/assessment.md](docs/assessment.md) for requirements, scope and roadmap.

## What is in the slice

- **Verification as evidence, not a flag.** A claim (role, department, year) is separate from its
  verification case, which moves through an explicit state machine (`pending`, `under_review`,
  `verified`, `rejected`, `appealed`, `revoked`) with a full audit trail. A university mailbox
  verifies only the role its domain is configured to prove; everyone else goes to an admin queue.
- **One privacy policy for every read path.** Search, profile view and connection actions embed
  the same SQL predicate, so blocking (both directions), hidden profiles, suspension and revoked
  verification take effect everywhere at once.
- **Race-safe relationships.** Duplicate or simultaneous reciprocal requests produce exactly one
  connection (advisory lock per pair + partial unique index + canonical pair key).
- **Measured search.** PostgreSQL full-text + trigram search with keyset pagination;
  [benchmarked at 10k and 100k profiles](docs/benchmarks/directory-search.md).

## Repository layout

```
apps/api        Fastify API (modules: identity, verification, profiles, directory, relationships, admin; policy/)
apps/api/src/db/migrations   SQL migrations (applied in order on startup)
apps/api/test   API integration tests against a real PostgreSQL database
apps/api/bench  Directory search benchmark
apps/web        React + Vite client
packages/shared Zod schemas and types shared by API and client
e2e             Playwright end-to-end test of the full journey
docs            Assessment, threat model, ADRs, benchmark results
```

## Running locally

Requirements: Node 22+, pnpm 10, PostgreSQL 16 (with `pg_trgm` and `citext`, included in standard
packages).

```bash
pnpm install

# one-time database setup (adjust to your Postgres install)
psql -U postgres -c "CREATE ROLE alumni LOGIN PASSWORD 'alumni' CREATEDB"
createdb -U postgres -O alumni alumni_dev
createdb -U postgres -O alumni alumni_test

cp apps/api/.env.example apps/api/.env   # edit VERIFICATION_EMAIL_DOMAINS for your university
pnpm dev                                 # API on :3000 (runs migrations), web on :5173
```

With `DEV_MAILBOX=true` (development only) emails are kept in memory: the API log shows that a
mail was queued, and `GET /api/dev/mailbox?email=you@example.com` returns the latest message with
its verification link.

To review alumni claims you need an administrator. Admin rights cannot be granted through the API:

```bash
pnpm --filter @alumni/api grant-admin office@example.org
```

### Configuration (`apps/api/.env`)

| Variable                                               | Meaning                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                         | PostgreSQL connection string                                                                                                   |
| `VERIFICATION_EMAIL_DOMAINS`                           | `role:domain` pairs, e.g. `student:students.uni.edu,faculty:uni.edu`. A verified mailbox on that domain proves that role only. |
| `APP_BASE_URL`                                         | Base URL used in emailed links                                                                                                 |
| `COOKIE_SECURE`                                        | `true` behind HTTPS                                                                                                            |
| `DEV_MAILBOX`                                          | `true` to expose the in-memory mailbox route (refused in production)                                                           |
| `RATE_LIMIT_AUTH_PER_MIN`, `RATE_LIMIT_SEARCH_PER_MIN` | Per-IP limits (defaults 10 and 60)                                                                                             |

## Checks

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test        # API tests; needs TEST_DATABASE_URL or the default alumni_test database
pnpm e2e         # Playwright; needs an alumni_e2e database (reset on every run)
pnpm --filter @alumni/api bench 10000 100000   # needs an alumni_bench database
```

If Playwright's bundled browser is unavailable, point it at a local Chromium with
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome pnpm e2e`.

## Known limitations

- No production email provider yet: the server refuses to start with `NODE_ENV=production`.
- No messaging, reporting, notifications, account deletion or data export yet.
- Admin accounts have no MFA; no security headers (CSP) are set yet.
- Department, degree and graduation year are self-declared even for verified members.
- Rate limits are per IP and in-memory (single process only).
- Not deployed; no backup/restore procedure tested yet.

## Documentation

- [Project assessment](docs/assessment.md): requirements, assumptions, architecture comparison, scope, roadmap
- [Threat model](docs/threat-model.md)
- Architecture decisions: [docs/adr](docs/adr)
- [Directory search benchmark](docs/benchmarks/directory-search.md)
