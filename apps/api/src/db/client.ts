import pg from 'pg';

export type Db = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    // Fail fast instead of queueing forever when the database is unreachable or saturated.
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 15_000,
  });
}

/** Runs `fn` in a transaction; rolls back on any thrown error. */
export async function withTx<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
