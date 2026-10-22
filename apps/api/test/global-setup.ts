import pg from 'pg';
import { migrate } from '../src/db/migrate.ts';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://alumni:alumni@localhost:5432/alumni_test';

/** Recreates the test schema from migrations once per run, so tests also verify the migrations. */
export default async function setup(): Promise<void> {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  await pool.end();
}
