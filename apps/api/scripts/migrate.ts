import { createPool } from '../src/db/client.ts';
import { migrate } from '../src/db/migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const pool = createPool(url);
const applied = await migrate(pool, console.log);
console.log(applied.length ? `${applied.length} migration(s) applied` : 'schema up to date');
await pool.end();
