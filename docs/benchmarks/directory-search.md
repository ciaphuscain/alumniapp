# Directory search benchmark

**What is measured:** the production query builder (`apps/api/src/modules/directory/service.ts`)
running against PostgreSQL, including the shared visibility policy (verified, active, discoverable,
not blocked) and the follow-up skills query. HTTP, JSON serialization and network are **not**
included.

**How to reproduce:** `createdb alumni_bench` (owned by the app role), then
`pnpm --filter @alumni/api bench 10000 100000`. The script rebuilds the schema from migrations,
seeds a deterministic synthetic directory (`setseed(0.42)`), runs `VACUUM ANALYZE`, then runs each
query 20× warm-up + 200× measured, sequentially, `limit=20`. Raw output with every query plan:
[`results/2026-10-22-directory-search.md`](results/2026-10-22-directory-search.md).

**Environment (2026-10-22):** shared cloud container, 4 vCPU Intel Xeon 2.10 GHz, 15.7 GiB RAM,
PostgreSQL 16.15 with default settings, Node 22.22, client and database on the same host. Run-to-run
noise is large here: with the same code and data, the one-word text query at 100k measured 139.5 ms
p50 in the benchmark run and 106–114 ms p50 in a later standalone run (~25 %). Treat smaller
differences as noise.

**Dataset:** ~90 % verified, ~5 % hidden, 25 % open to mentoring, 1–4 skills each, the viewer has
blocked 50 members. Synthetic values come from small vocabularies (15 companies, 10 titles), so
broad text terms match far more profiles than they would in real data: e.g. `engineer` matches
~30 % of profiles. This makes the text rows a pessimistic case.

## Results (p50 / p95 ms)

| Query                                 | 10k profiles | 100k profiles |
| ------------------------------------- | -----------: | ------------: |
| Browse, no filters                    |    4.3 / 8.7 |     4.4 / 5.3 |
| Department + graduation-year range    |    6.1 / 8.6 |    8.9 / 11.3 |
| Skill filter                          |    7.9 / 9.9 |   10.0 / 13.8 |
| Company substring                     |    3.9 / 5.7 |     4.7 / 5.9 |
| Mentors in a city                     |    4.3 / 5.1 |     4.3 / 5.6 |
| Text: one broad word (`engineer`)     |  20.7 / 31.5 | 139.5 / 163.5 |
| Text: name prefix (`priya`)           |  20.7 / 26.5 |   76.9 / 92.9 |
| Text: name with typo (`Ananya Iyerr`) |  25.6 / 32.5 |  94.2 / 113.9 |
| Text + department + role              |    7.0 / 9.4 |   55.1 / 66.3 |
| Browse, page 5 via keyset cursor      |    3.8 / 4.7 |     4.1 / 5.4 |

## Findings

1. **Structured filters and browsing are flat with size** (≈4–10 ms p50 at 100k): indexes on
   name ordering, `profile_skills(skill)`, trigram company/location and keyset pagination keep work
   proportional to the page, not the table. Page 5 costs the same as page 1.
2. **Free-text relevance ranking scales with the number of matches.** Every matching profile must
   be scored (`ts_rank` + trigram `similarity`) before the top 20 can be chosen. At 100k, a broad
   word matched ~30k rows and took ~100–140 ms p50. The index lookup itself took ~5 ms; the rest is
   scoring and sorting (see plan). Raising `work_mem` from 4 MB to 16 MB removed the on-disk sort
   but did **not** change latency (measured 106–114 ms p50 for both), so memory is not the
   bottleneck — scoring is.
3. **Block check rewrite: plan improved, latency unchanged within noise.** The first version used
   one `NOT EXISTS (... OR ...)`, which at 10k forced a nested loop that re-scanned the blocks list
   for every candidate (`Rows Removed by Join Filter: 128903`). Splitting it into two `NOT EXISTS`
   clauses lets the planner use anti-joins. The before/after p50 for the one-word query at 100k
   (98 → 140 ms) moved in the wrong direction, but the same query measured 106–114 ms in a later run of the same code, so the difference is within noise. This is **not**
   claimed as a performance win; it was kept because it is the same complexity and gives a
   simpler plan.

## Against provisional targets

NFR-003 targets p95 ≤ 200 ms for directory search at pilot scale (≤ 20k profiles) on modest
hardware. Every measured query meets it at 10k, and every query also meets it at 100k on this
machine, with broad text search the closest (p95 164 ms).

**Revisit triggers** (any one): production p95 for text search > 200 ms; typical text queries
match > 20k profiles; directory > 250k profiles. Next options in order of cost: rank only within
a cheaper pre-filtered candidate set (e.g. name/headline weight A/B first), cache facet-free browse
pages, then a dedicated search engine (ADR-0005).
