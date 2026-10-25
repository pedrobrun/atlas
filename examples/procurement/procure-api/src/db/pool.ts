import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

// Money columns are BIGINT; pg returns those as strings unless told otherwise.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`bigint ${value} exceeds the safe integer range`);
  return n;
});
// Keep DATE columns as "YYYY-MM-DD" instead of local-midnight Date objects.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

export type Db = pg.Pool | pg.PoolClient;
export type TxClient = pg.PoolClient;

export async function withTransaction<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
