# Project assessment — University Alumni Network

Status: living document, first written alongside the first vertical slice (2026-10-22).
Labels used throughout: **implemented**, **tested** (automated test exists and passes),
**measured** (benchmark exists), **designed** (decided, not built), **assumed** (not yet validated).

## A. Product and requirements

### Core problem

Students, alumni and professors of one university cannot reliably find the right person (by
department, batch, employer, skill, research area) and make trusted contact with them. Generic
networks lack verified university affiliation and expose members to impersonation and spam.

**Primary outcome:** a verified member finds a relevant person and the contact is accepted.
Feeds, communities, messaging and events exist to support that outcome.

### Highest-value journeys (in build order)

1. Register → verify email → claim affiliation → become verified (auto or admin review). _(implemented, tested, e2e)_
2. Build a professional profile and control discoverability. _(implemented, tested)_
3. Search the directory with structured filters and text. _(implemented, tested, measured)_
4. Send a connection request with a note → accepted. _(implemented, tested, e2e)_
5. Message a connection. _(next slice, designed below)_
6. Request mentorship as a structured workflow. _(P1)_

### Functional requirements (first release)

| ID     | Requirement                                                                                                                                    | Priority                 | Status / verification                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| FR-001 | Register with email + password; email ownership proven by a single-use, expiring link.                                                         | P0                       | Implemented; `identity.test.ts`                           |
| FR-002 | Registration and login must not reveal whether an email is registered.                                                                         | P0                       | Implemented; `identity.test.ts`                           |
| FR-003 | Members claim one affiliation (student / alumni / faculty, department, degree, year).                                                          | P0                       | Implemented; `verification.test.ts`                       |
| FR-004 | A claim is verified automatically only when the verified mailbox domain is configured to prove **that** role; otherwise it waits for an admin. | P0                       | Implemented; `verification.test.ts`                       |
| FR-005 | Admins review a queue, verify / reject / revoke with a recorded rationale; rejected members can appeal.                                        | P0                       | Implemented; `verification.test.ts`, e2e                  |
| FR-006 | Only verified, active members can search, view profiles or send requests.                                                                      | P0                       | Implemented; `directory.test.ts`, `relationships.test.ts` |
| FR-007 | Profile with headline, company, title, industry, location, skills, research interests, mentorship availability, discoverability.               | P0                       | Implemented                                               |
| FR-008 | Directory search: text (prefix, stemming, typo-tolerant names) + department, year range, role, company, industry, location, skill, mentoring.  | P0                       | Implemented; `directory.test.ts`; measured                |
| FR-009 | Connection requests: send (with note), accept, decline, cancel; duplicate sends idempotent; reciprocal send = accept.                          | P0                       | Implemented; `relationships.test.ts`                      |
| FR-010 | Blocking hides both parties from each other in search and profile view, cancels pending requests and removes the connection.                   | P0                       | Implemented; tested                                       |
| FR-011 | Admins can suspend / reinstate accounts; suspension revokes sessions and hides the account immediately.                                        | P0                       | Implemented; tested                                       |
| FR-012 | One-to-one messaging between connected members.                                                                                                | P0                       | Designed (next slice)                                     |
| FR-013 | Reporting a member or content to moderators.                                                                                                   | P0                       | Designed (next slice)                                     |
| FR-014 | Notifications for requests / acceptances / messages.                                                                                           | P1                       | Designed (outbox)                                         |
| FR-015 | Mentorship request workflow.                                                                                                                   | P1                       | Not started                                               |
| FR-016 | Account deletion and data export.                                                                                                              | P0 before external users | Not started                                               |

### Non-functional requirements (provisional targets — hypotheses, not claims)

| ID      | Target                                                                                                   | Evidence so far                                                      |
| ------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| NFR-001 | Every authorization rule has a negative test.                                                            | 29 API tests incl. negative paths; not yet exhaustive                |
| NFR-002 | No duplicate business effect from concurrent or repeated requests (connections, verification decisions). | Concurrency tests; mutation check: removing the pair lock fails them |
| NFR-003 | Directory search p95 ≤ 200 ms at pilot scale (≤ 20k profiles), excluding network.                        | Measured: worst p95 32 ms at 10k, 164 ms at 100k (see benchmark doc) |
| NFR-004 | Profile view p95 ≤ 150 ms at pilot scale.                                                                | Not yet measured                                                     |
| NFR-005 | Passwords: argon2id; session tokens ≥ 256-bit random, stored hashed; cookies HttpOnly + SameSite.        | Implemented                                                          |
| NFR-006 | Pilot hosting ≤ ~US$25/month.                                                                            | Not yet deployed; estimate pending                                   |
| NFR-007 | Logs never contain passwords, tokens, cookies or message bodies.                                         | Cookie/auth headers redacted; dev mailer logs subject only           |
| NFR-008 | Restore from backup tested before external users.                                                        | Not started                                                          |

### Assumption register

| Assumption                                                                   | Reason                                       | Confidence | Affects               | Validation                                     | If wrong                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------- | ---------- | --------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| One university, < 20k accounts in the first year                             | Brief; pilot scope                           | Medium     | Architecture, search  | Ask alumni office for alumni counts            | Re-run benchmark at real size; revisit ADR-0005        |
| University issues per-role mail domains (e.g. students. vs staff)            | Common practice, unconfirmed                 | Low        | FR-004                | Confirm domains with university IT             | Faculty must go through admin review; more review load |
| Most alumni do **not** have a working university mailbox                     | Typical for older batches                    | Medium     | Review workload       | Pilot measurement of auto vs manual share      | Need alumni-record import or peer attestation sooner   |
| No access to authoritative alumni records initially                          | Not offered; requires permission and consent | High       | Verification          | Ask alumni office                              | If available, add record-match evidence method         |
| Department / year are self-declared even when the role is verified           | A mailbox proves role, not batch             | High       | Search trust, UI copy | —                                              | Label in UI (done in onboarding copy)                  |
| Indian DPDP Act 2023 obligations apply (consent, notice, erasure, grievance) | Users and operator in India                  | Medium     | Privacy features      | Legal / university counsel review              | Feature and process changes before launch              |
| Polling is sufficient for messaging at pilot scale                           | Low concurrency                              | Medium     | Messaging transport   | Measure message latency needs with pilot users | Add WebSockets / SSE (ADR to be written)               |
| A solo developer maintains this                                              | Brief                                        | High       | Everything            | —                                              | Can afford more operational components                 |

### Success metrics

Primary: **accepted connection requests per verified member per month** and **time to first
accepted connection**. Diagnostics: search → profile view → request conversion, empty-result
rate, verification turnaround (submit → decision), share auto-verified vs manual, reports per
1000 requests. Avoid: raw searches, page views, or connection counts as goals (they reward spam).

## B. Engineering analysis

### State machines (implemented)

- **Verification case:** `pending → under_review → verified | rejected`; `pending → verified`
  (auto, institutional email, or admin); `rejected → appealed → under_review | verified | rejected`;
  `verified → revoked` (terminal). Transition table in `verification/state-machine.ts`; rows locked
  `FOR UPDATE`; every transition writes `verification_events` + `audit_events` in the same
  transaction. Automation can never override a human decision (`auto_verify` only from `pending`).
- **Connection request:** `pending → accepted | declined | cancelled` (all terminal). Accept /
  decline only by addressee; cancel only by requester. Conditional `UPDATE … WHERE state = 'pending'`
  makes the loser of a race get 409. All changes for one user pair take a transaction-scoped
  advisory lock; a partial unique index enforces one pending request per unordered pair; the
  `connections` table stores pairs canonically (`user_low < user_high`).

### Data ownership

`users`/`sessions`/`email_tokens` — Identity. `affiliation_claims` (what the user says) vs
`verification_cases`/`verification_events` (what the university decided) — Verification. "Verified"
is derived from the case, never a writable user column. `profiles`/`profile_skills` — Profiles.
`connection_requests`/`connections`/`blocks` — Relationships. `audit_events` — append-only, written
by every module inside its own transaction.

### Privacy boundary

One module (`apps/api/src/policy/visibility.ts`) defines who may appear in search and who may be
viewed; the directory query, profile view and connection actions all embed the same SQL fragment.
This is what made the cross-feature tests (block, hide, suspend, revoke → gone everywhere) cheap to
write and pass. Every future read path (messages, feeds, notifications, community member lists)
must use it too.

### Threats

See [threat-model.md](threat-model.md). The highest residual risks today: no production email
provider, no reporting flow, no account deletion, and admin accounts protected only by a password.

### Likely bottlenecks / failure modes

1. Admin review backlog for alumni without university mailboxes (product, not technical).
2. Broad text search at large directory sizes (measured: scoring cost grows with matches).
3. Email deliverability (verification depends on it; not yet built for production).
4. Database is the single point of failure; acceptable for the pilot with tested backups.

### Most consequential unknowns

University mail-domain structure and willingness to share alumni records; legal review of consent
and retention; realistic alumni count; whether alumni actually respond to requests.

## C. Architecture

| Criterion                    | A. Simple full-stack (Next.js + DB) | **B. Modular monolith + Postgres** | C. B + separate workers/queue | D. Services / event-driven |
| ---------------------------- | ----------------------------------- | ---------------------------------- | ----------------------------- | -------------------------- |
| Fit for P0                   | Good                                | Good                               | Good                          | Poor (no need)             |
| Transactional consistency    | Good                                | Good                               | Good (+outbox)                | Hard                       |
| Enforcing one privacy policy | Easy to scatter into routes         | Explicit module + shared SQL       | Same as B                     | Duplicated across services |
| Ops cost (solo dev)          | Lowest                              | Low                                | Medium                        | High                       |
| Testing                      | Easy                                | Easy (real DB)                     | Medium                        | Hard                       |
| Migration path               | To B                                | To C when async work appears       | To D if teams/scale demand    | —                          |

**Decision: B** ([ADR-0001](adr/0001-modular-monolith.md)). One Fastify process with module
folders (`identity`, `verification`, `profiles`, `directory`, `relationships`, `admin`) and a
shared `policy` module; one PostgreSQL database; a separate React SPA. Workers are added only when
the first genuinely asynchronous side effect (email/notifications) lands, via a database outbox.

API approach: JSON over REST, Zod validation with strict objects (unknown fields rejected), uniform
`{ error: { code, message } }`, 404 for anything the viewer may not know exists.

## D. Technology decisions

| Area          | Choice                                                   | Main alternative(s)             | Why                                                                         | ADR                                    |
| ------------- | -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| Language      | TypeScript end-to-end                                    | Python backend                  | Shared Zod schemas; one toolchain for a solo developer                      | —                                      |
| Backend       | Fastify 5                                                | Express, Next.js route handlers | Small, fast, good plugin model; keeps domain code out of the UI framework   | [0001](adr/0001-modular-monolith.md)   |
| Database      | PostgreSQL 16, raw parameterized SQL via `pg`, SQL files | SQLite; ORM (Drizzle/Prisma)    | Partial unique indexes, FTS, trigram, advisory locks; SQL stays reviewable  | [0002](adr/0002-postgresql.md)         |
| Sessions      | Opaque server-side sessions in cookie                    | JWT                             | Immediate revocation on suspension/logout                                   | [0003](adr/0003-server-sessions.md)    |
| Verification  | Claim + case state machine + evidence methods            | `is_verified` flag              | Auditable, appealable, revocable                                            | [0004](adr/0004-verification-model.md) |
| Search        | Postgres FTS + `pg_trgm`, keyset pagination              | Meilisearch / OpenSearch        | Measured adequate; one source of truth for privacy filtering                | [0005](adr/0005-directory-search.md)   |
| Relationships | Request + canonical connection; no follow                | Follow graph; graph DB          | Mutual consent matches the product; Postgres handles 1-hop queries easily   | [0006](adr/0006-relationship-model.md) |
| Frontend      | React 19 + Vite + React Router + TanStack Query          | Next.js                         | No SEO need (private network); simple static hosting                        | —                                      |
| Tests         | Vitest on a real Postgres; Playwright e2e                | Mocked DB                       | Constraints, locks and SQL policy can only be tested against the real thing | —                                      |

**Deferred until evidence:** WebSockets vs polling for messages; outbox worker vs in-process
dispatch; object storage for attachments; email provider; hosting provider; semantic search.

## E. Execution

### Scope

- **P0 (first usable release):** slice above (done) + messaging between connections + report
  member + account deletion/export + production email + deployment with backups.
- **P1:** notifications (outbox), mentorship workflow, opportunities, home feed (chronological).
- **P2:** communities with moderation, events, introductions via mutual connections.
- **P3:** semantic search evaluated against the measured baseline; real-time transport.
- **P4 / rejected for now:** microservices, Kubernetes, Kafka, graph DB, vector DB, E2E encryption,
  voice/video, AI verification decisions.

### Roadmap (vertical slices)

1. ✅ Identity → verification → profile → directory → connection (this commit set).
2. Messaging between connected members (polling), message requests off by default; report member.
3. Outbox + worker: verification and request emails via a real provider; in-app notifications.
4. Account deletion / export, retention rules, privacy notice, admin MFA; deploy + backup/restore drill.
5. Pilot with a small cohort; measure success metrics; then mentorship.

### Definition of done for the first usable release

All P0 FRs implemented with positive and negative tests; e2e for each P0 journey; directory and
profile benchmarks at real pilot size; threat model reviewed with residual risks accepted;
backup restored successfully once; privacy notice and deletion flow live; no known way to see a
hidden, blocked, suspended or unverified member through any endpoint.
