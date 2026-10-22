/** Grants the admin role to an existing account. Admin rights are never assignable through the API. */
import { createPool } from '../src/db/client.ts';
import { audit } from '../src/lib/audit.ts';

const email = process.argv[2];
const url = process.env.DATABASE_URL;
if (!email || !url) throw new Error('usage: DATABASE_URL=... pnpm grant-admin <email>');
const pool = createPool(url);
const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
if (!rows[0]) throw new Error(`No user with email ${email}`);
await pool.query(
  `INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING`,
  [rows[0].id],
);
await audit(pool, {
  actorId: null,
  action: 'role.admin_granted',
  subjectType: 'user',
  subjectId: rows[0].id,
  metadata: { via: 'cli' },
});
console.log(`admin granted to ${email}`);
await pool.end();
