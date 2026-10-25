import { createHash } from 'node:crypto';
import { pool } from '@/db/pool';
import { nextAttemptAt, shouldGiveUp } from './backoff';

export type BeginDecision = 'proceed' | 'skip' | 'wait' | 'dead';

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function begin(
  key: string,
  entityType: string,
  entityId: string,
  hash: string,
  now = new Date(),
): Promise<BeginDecision> {
  const { rows } = await pool.query(
    `INSERT INTO sync_ledger (idempotency_key, entity_type, entity_id, payload_hash, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = sync_ledger.updated_at
     RETURNING status, payload_hash, next_attempt_at, (xmax = 0) AS inserted`,
    [key, entityType, entityId, hash],
  );
  const row = rows[0]!;
  if (row.inserted) return 'proceed';
  if (row.status === 'succeeded') {
    if (row.payload_hash !== hash)
      console.warn(`ledger key ${key} already succeeded with a different payload; not resending`);
    return 'skip';
  }
  if (row.status === 'dead') return 'dead';
  if (row.next_attempt_at && row.next_attempt_at > now) return 'wait';
  return 'proceed';
}

export async function recordSuccess(key: string, externalId: string): Promise<void> {
  await pool.query(
    `UPDATE sync_ledger SET status = 'succeeded', external_id = $2, attempts = attempts + 1, last_error = NULL,
       next_attempt_at = NULL, updated_at = now() WHERE idempotency_key = $1`,
    [key, externalId],
  );
}

export async function recordFailure(
  key: string,
  error: string,
  retryable: boolean,
  now = new Date(),
): Promise<'failed' | 'dead'> {
  const { rows } = await pool.query<{ attempts: number }>(
    'UPDATE sync_ledger SET attempts = attempts + 1, last_error = $2, updated_at = now() WHERE idempotency_key = $1 RETURNING attempts',
    [key, error.slice(0, 4000)],
  );
  const attempts = rows[0]?.attempts ?? 1;
  const dead = shouldGiveUp(attempts, retryable);
  await pool.query('UPDATE sync_ledger SET status = $2, next_attempt_at = $3 WHERE idempotency_key = $1', [
    key,
    dead ? 'dead' : 'failed',
    dead ? null : nextAttemptAt(attempts, now),
  ]);
  return dead ? 'dead' : 'failed';
}

export async function externalIdFor(key: string): Promise<string | null> {
  const { rows } = await pool.query<{ external_id: string | null }>(
    "SELECT external_id FROM sync_ledger WHERE idempotency_key = $1 AND status = 'succeeded'",
    [key],
  );
  return rows[0]?.external_id ?? null;
}

export async function countDeadSince(since: Date): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM sync_ledger WHERE status = 'dead' AND updated_at >= $1",
    [since],
  );
  return Number(rows[0]?.n ?? 0);
}

// Cursors mark how far each source has been read; they only ever move forward.
const EPOCH = new Date('1970-01-01T00:00:00Z');

export async function getCursor(name: string): Promise<Date> {
  const { rows } = await pool.query<{ cursor: Date }>('SELECT cursor FROM sync_cursors WHERE name = $1', [
    name,
  ]);
  return rows[0]?.cursor ?? EPOCH;
}

export async function setCursor(name: string, cursor: Date): Promise<void> {
  await pool.query(
    `INSERT INTO sync_cursors (name, cursor) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET cursor = GREATEST(sync_cursors.cursor, EXCLUDED.cursor), updated_at = now()`,
    [name, cursor],
  );
}
