import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({ connectionString, max: 4 });

const SCHEMA_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations',
  '001_sync_store.sql',
);

/**
 * erp-sync's schema is one idempotent file (CREATE ... IF NOT EXISTS), so each run applies it
 * before doing anything else instead of keeping a migration runner.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(await readFile(SCHEMA_FILE, 'utf8'));
}
