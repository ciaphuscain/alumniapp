# ADR-0002: PostgreSQL with hand-written SQL and plain migration files

Status: accepted (2026-10-22)

**Context.** Core invariants are relational: one pending request per pair, canonical connection
pairs, one claim per user, verification state history. Search needs full-text and fuzzy matching.

**Options.** SQLite; PostgreSQL with an ORM (Drizzle, Prisma); PostgreSQL with parameterized SQL.

**Decision.** PostgreSQL 16 through `pg` with parameterized SQL, and numbered `.sql` migration
files applied in order by a ~50-line runner (`src/db/migrate.ts`, advisory-locked, one transaction
per file). The initial plan named Drizzle; it was dropped during implementation because the schema
relies on features (partial unique expression indexes, generated `tsvector`, `pg_trgm`, advisory
locks, CHECK constraints) that are clearer as SQL than as ORM definitions, and the visibility
policy is itself a SQL fragment that must be embedded verbatim.

**Why not SQLite.** No concurrent writers across processes, no `pg_trgm`, weaker FTS ranking,
and managed hosting options are fewer.

**Consequences.** No generated types for rows (route code maps rows to typed API shapes); SQL
review is on the developer. Migrations are forward-only; rollback = new migration.

**Revisit when** query-mapping boilerplate causes real defects, or a read replica becomes necessary.
