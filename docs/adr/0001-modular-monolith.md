# ADR-0001: Modular monolith on one PostgreSQL database

Status: accepted (2026-10-22)

**Context.** Solo developer, one university, pilot scale, cost-conscious. The hardest requirements
are cross-cutting: verification, privacy and blocking must apply identically to search, profiles,
connections and later messages, feeds and notifications.

**Options.** (A) single full-stack framework app; (B) modular monolith API + SPA; (C) B plus
workers/queue; (D) separately deployed services.

**Decision.** B. One Fastify process; modules under `apps/api/src/modules/*` own their tables and
routes; `apps/api/src/policy` holds authorization and visibility rules that every module uses.
Business changes and their audit rows commit in one transaction.

**Why not D.** No independent scaling or team boundaries exist; distributed transactions and
duplicated privacy rules would add failure modes without benefit. **Why not A.** Workable, but
framework route files tend to absorb domain logic; B keeps the domain testable without the UI.

**Consequences.** Simple deploy and debugging; module boundaries are conventions, not enforced by
the build. Async work (email, notifications) will need a worker; planned as a DB outbox (C) when
the first such feature lands.

**Revisit when** a module needs independent scaling or availability (e.g. real-time messaging
with thousands of concurrent connections), or a second team works on the codebase.
