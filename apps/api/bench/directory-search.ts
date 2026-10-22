/**
 * Directory search benchmark.
 *
 *   BENCH_DATABASE_URL=postgres://.../alumni_bench pnpm --filter @alumni/api bench [sizes...]
 *
 * For each dataset size it rebuilds a synthetic, deterministic directory, then runs a fixed
 * query mix through the production query builder (same SQL and visibility policy as the
 * API, excluding HTTP overhead) and reports latency percentiles plus the plan of each query.
 */
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import type pg from 'pg';
import type { DirectorySearchQuery } from '@alumni/shared';
import { createPool } from '../src/db/client.ts';
import { migrate } from '../src/db/migrate.ts';
import { buildSearch, searchDirectory } from '../src/modules/directory/service.ts';

const url =
  process.env.BENCH_DATABASE_URL ?? 'postgres://alumni:alumni@localhost:5432/alumni_bench';
if (!/_bench$/.test(new URL(url).pathname))
  throw new Error('Benchmark database name must end in _bench');
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const SIZES = sizes.length ? sizes : [10_000, 100_000];
const WARMUP = 20;
const REPS = 200;

const QUERIES: Record<string, Partial<DirectorySearchQuery>> = {
  'browse (no filters)': {},
  'department + year range': {
    department: 'Computer Science',
    gradYearFrom: 2010,
    gradYearTo: 2015,
  },
  'skill filter': { skill: 'kubernetes' },
  'company substring': { company: 'micro' },
  'mentors in a city': { mentorship: 'true', location: 'bengaluru' },
  'text: one word': { q: 'engineer' },
  'text: name prefix': { q: 'priya' },
  'text: name with typo': { q: 'Ananya Iyerr' },
  'text + filters': { q: 'data', department: 'Computer Science', role: 'alumni' },
  'browse page 5 (cursor)': {},
};

const pool = createPool(url);

async function seed(n: number): Promise<string> {
  // One dedicated connection: the seed relies on a session-local temp table.
  const db = await pool.connect();
  try {
    return await seedWith(db, n);
  } finally {
    db.release();
  }
}

async function seedWith(db: pg.PoolClient, n: number): Promise<string> {
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  await db.query(`SELECT setseed(0.42)`);
  await db.query(`
    DROP TABLE IF EXISTS pick;
    CREATE TEMP TABLE pick AS SELECT
      ARRAY['Priya','Arjun','Ananya','Rahul','Meera','Vikram','Kavya','Rohan','Divya','Karthik','Sneha','Aditya','Lakshmi','Nikhil','Pooja','Suresh','Fatima','John','Wei','Maria'] AS first,
      ARRAY['Natarajan','Mehta','Iyer','Sharma','Reddy','Kumar','Nair','Singh','Gupta','Rao','Menon','Das','Khan','Pillai','Joshi'] AS last,
      ARRAY['Computer Science','Electrical Engineering','Mechanical Engineering','Civil Engineering','Physics','Mathematics','Economics','Chemistry','Biotechnology','Management'] AS dept,
      ARRAY['Google','Microsoft','Infosys','TCS','Amazon','Flipkart','Zoho','Tata Power','ISRO','Wipro','Freshworks','Swiggy','Startup','University','Deloitte'] AS company,
      ARRAY['Software Engineer','Data Scientist','Product Manager','Research Scientist','Consultant','Founder','Professor','Analyst','Design Engineer','Engineering Manager'] AS title,
      ARRAY['Bengaluru','Chennai','Mumbai','Hyderabad','Pune','Delhi','Seattle','London','Singapore','Berlin'] AS city,
      ARRAY['python','go','kubernetes','machine learning','distributed systems','matlab','finance','react','sql','embedded systems','vlsi','product strategy','statistics','cad','research'] AS skill`);
  await db.query(
    `INSERT INTO users (id, email, password_hash, email_verified_at)
     SELECT gen_random_uuid(), 'user' || i || '@bench.example', 'x', now() FROM generate_series(1, $1) i`,
    [n],
  );
  await db.query(`
    INSERT INTO affiliation_claims (user_id, role, department, graduation_year)
    SELECT u.id,
           (ARRAY['alumni','alumni','alumni','alumni','student','faculty'])[1 + floor(random() * 6)::int],
           dept[1 + floor(random() * array_length(dept, 1))::int],
           1985 + floor(random() * 42)::int
      FROM users u, pick`);
  await db.query(`
    INSERT INTO verification_cases (claim_id, state, method)
    SELECT id, CASE WHEN random() < 0.9 THEN 'verified' ELSE 'pending' END, 'admin_review' FROM affiliation_claims`);
  await db.query(`
    INSERT INTO profiles (user_id, display_name, headline, current_company, current_title, location,
                          mentorship_available, discoverability, industry)
    SELECT u.id,
           first[1 + floor(random() * array_length(first, 1))::int] || ' ' || last[1 + floor(random() * array_length(last, 1))::int],
           t || ' at ' || c, c, t,
           city[1 + floor(random() * array_length(city, 1))::int],
           random() < 0.25,
           CASE WHEN random() < 0.95 THEN 'verified_members' ELSE 'hidden' END,
           'Technology'
      FROM users u, pick,
           LATERAL (SELECT title[1 + floor(random() * array_length(title, 1))::int] AS t,
                           company[1 + floor(random() * array_length(company, 1))::int] AS c
                     WHERE u.id IS NOT NULL) x`);
  await db.query(`
    INSERT INTO profile_skills (user_id, skill)
    SELECT DISTINCT p.user_id, skill[1 + floor(random() * array_length(skill, 1))::int]
      FROM profiles p, pick, generate_series(1, 4)`);
  await db.query(`
    UPDATE profiles p SET skills_text = s.txt
      FROM (SELECT user_id, string_agg(skill, ' ') AS txt FROM profile_skills GROUP BY user_id) s
     WHERE s.user_id = p.user_id`);
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT ac.user_id FROM affiliation_claims ac JOIN verification_cases vc ON vc.claim_id = ac.id
      WHERE vc.state = 'verified' ORDER BY ac.user_id LIMIT 1`,
  );
  const viewer = rows[0]!.user_id;
  await db.query(
    `INSERT INTO blocks (blocker_id, blocked_id)
     SELECT $1, user_id FROM profiles WHERE user_id <> $1 ORDER BY user_id DESC LIMIT 50`,
    [viewer],
  );
  await db.query('VACUUM ANALYZE');
  return viewer;
}

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

async function run(): Promise<void> {
  const { rows: v } = await pool.query<{ version: string }>('SELECT version()');
  console.log(`# Directory search benchmark — ${new Date().toISOString()}`);
  console.log(
    `node ${process.version}; ${os.cpus().length} vCPU (${os.cpus()[0]?.model}); ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM`,
  );
  console.log(`${v[0]!.version}`);
  console.log(
    `warm-up ${WARMUP}, repetitions ${REPS}, sequential, limit 20, client and server on the same host\n`,
  );

  for (const n of SIZES) {
    const t0 = performance.now();
    const viewer = await seed(n);
    console.log(
      `## ${n.toLocaleString('en-US')} profiles (seeded in ${((performance.now() - t0) / 1000).toFixed(1)} s)\n`,
    );
    console.log('| query | results | p50 ms | p95 ms | p99 ms |');
    console.log('|---|---:|---:|---:|---:|');
    const plans: string[] = [];
    for (const [name, filters] of Object.entries(QUERIES)) {
      let f = { limit: 20, ...filters } as DirectorySearchQuery;
      if (name.startsWith('browse page 5')) {
        for (let i = 0; i < 4; i++) {
          const r = await searchDirectory(pool, viewer, f);
          f = { ...f, cursor: r.nextCursor! };
        }
      }
      const times: number[] = [];
      let count = 0;
      for (let i = 0; i < WARMUP + REPS; i++) {
        const s = performance.now();
        const r = await searchDirectory(pool, viewer, f);
        const e = performance.now() - s;
        if (i >= WARMUP) times.push(e);
        count = r.results.length;
      }
      times.sort((a, b) => a - b);
      console.log(
        `| ${name} | ${count} | ${pct(times, 50).toFixed(2)} | ${pct(times, 95).toFixed(2)} | ${pct(times, 99).toFixed(2)} |`,
      );
      const { sql, params } = buildSearch(viewer, f);
      const plan = await pool.query(
        `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, SUMMARY ON) ${sql}`,
        params,
      );
      const lines = plan.rows.map((r) => r['QUERY PLAN'] as string);
      plans.push(`### ${name}\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``);
    }
    console.log(
      `\n<details><summary>Query plans (${n.toLocaleString('en-US')} profiles)</summary>\n\n${plans.join('\n\n')}\n\n</details>\n`,
    );
  }
  await pool.end();
}

await run();
