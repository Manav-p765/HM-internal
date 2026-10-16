import pg from 'pg';
import { config } from './config.js';
import { describeError } from './services/errorLog.js';

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates shifted to local time.
// NUMERIC already comes back as a string, which is what we want for money.
pg.types.setTypeParser(pg.types.builtins.DATE, value => value);

// Pool size and timeouts come from the environment (config.ts) with safe defaults:
//   DB_POOL_MAX 10, DB_STATEMENT_TIMEOUT_MS 15000 (a runaway query is cancelled), DB_IDLE_TIMEOUT_MS 30000,
//   DB_CONNECTION_TIMEOUT_MS 5000 (waiting for a free connection or a new one fails instead of hanging).
// Migrations turn the statement timeout off for their own connection (migrations.ts).
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
  statement_timeout: config.DB_STATEMENT_TIMEOUT_MS || undefined,
  application_name: 'hm-internal',
  // DB_SCHEMA (tests) puts our tables in a separate schema; public stays visible for citext.
  options: config.DB_SCHEMA ? `-c search_path=${config.DB_SCHEMA},public` : undefined,
});

pool.on('error', err => {
  // An idle client lost its connection (e.g. the database restarted); the pool replaces it.
  console.error(`Postgres pool error: ${describeError(err)}`);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Waits for the database at startup (a container may start before Postgres accepts connections).
export async function waitForDatabase(attempts = 30, delayMs = 2000, log: (m: string) => void = console.log): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt >= attempts) throw new Error(`Database not reachable after ${attempts} attempts (${(err as { code?: string }).code ?? 'error'})`);
      log(`Waiting for the database (attempt ${attempt}/${attempts}, ${(err as { code?: string }).code ?? 'error'})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
