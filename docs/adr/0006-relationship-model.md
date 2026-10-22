# ADR-0006: Mutual connections via requests; no follow relationship

Status: accepted (2026-10-22)

**Context.** The outcome we want is consented contact between a student and an alumnus. A
one-way follow adds a second relationship type with its own privacy questions and no P0 use.

**Decision.** `connection_requests` (pending → accepted/declined/cancelled) and `connections`
stored once per pair with `user_low < user_high`. Rules: duplicate sends return the existing
request; a send while the other side has a pending request accepts it; all changes for a pair
serialize on a transaction-scoped advisory lock; a partial unique index guarantees one pending
request per unordered pair even if code regresses. Blocking cancels pending requests and deletes
the connection. Messaging (next slice) will require a connection.

**Evidence.** Concurrency tests send A→B, B→A, A→B simultaneously five times and race accept vs
cancel; they fail when the advisory lock is removed and pass with it.

**Revisit when** follow-style announcements (e.g. faculty broadcasting talks) become a P1/P2
requirement — likely as community membership rather than a user-to-user follow.
