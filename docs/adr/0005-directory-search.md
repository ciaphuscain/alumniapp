# ADR-0005: Directory search in PostgreSQL (full-text + trigram)

Status: accepted (2026-10-22)

**Context.** Discovery is the core product. Results must exclude anyone the viewer may not see
(blocked, hidden, suspended, unverified) — a separate search index would have to replicate that
policy and be kept consistent on every privacy change.

**Decision.** Generated, weighted `tsvector` on profiles (name in `simple` config, other fields in
`english` for stemming) with a GIN index; `pg_trgm` for typo-tolerant names and substring filters;
prefix tsquery so partial words match; structured filters on indexed columns; keyset pagination
with deterministic ordering (`rank DESC, user_id` or `display_name, user_id`). The visibility
predicate is part of the same query.

**Evidence.** [Benchmark](../benchmarks/directory-search.md): structured queries 4–10 ms p50 at
100k profiles; broad text queries 77–140 ms p50 at 100k (cost grows with the number of matches;
`work_mem` was ruled out as the cause).

**Rejected for now.** Meilisearch/OpenSearch (extra service, sync lag, duplicated privacy logic);
semantic/vector search (no labeled evaluation set yet; must beat this baseline first).

**Revisit when** text-search p95 > 200 ms in production, typical queries match > 20k profiles, or
relevance complaints appear that ranking changes cannot fix.
