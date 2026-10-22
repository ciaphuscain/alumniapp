/** Drops and recreates the schema of a disposable database (name must end in _test or _e2e). */
import { createPool } from '../src/db/client.ts';
import { migrate } from '../src/db/migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const name = new URL(url).pathname.slice(1);
if (!/_(test|e2e)$/.test(name))
  throw new Error(`Refusing to reset non-disposable database "${name}"`);
const pool = createPool(url);
await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
await migrate(pool);
await pool.end();
console.log(`reset ${name}`);
