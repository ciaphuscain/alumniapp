import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';
import { createPool } from './db/client.ts';
import { migrate } from './db/migrate.ts';
import { MemoryMailer } from './lib/mailer.ts';

const config = loadConfig();
if (config.env === 'production') {
  // No production email provider is wired up yet; refuse to start rather than silently drop mail.
  throw new Error('Production mailer not configured (see README: Known limitations)');
}
const pool = createPool(config.databaseUrl);
await migrate(pool, (m) => console.log(m));
const app = await buildApp(
  { config, pool, mailer: new MemoryMailer((m) => app.log.info(m)) },
  { logger: true },
);

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: '127.0.0.1' });
