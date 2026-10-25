import { pool } from '@/db/pool';
import { publishToSqs } from './sqs-publisher';

const MAX_ATTEMPTS = 20;

export async function relayOutboxBatch(limit = 25): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, event_id, event_type, group_id, body FROM outbox
        WHERE sent_at IS NULL AND attempts < $2 ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit, MAX_ATTEMPTS],
    );

    let sent = 0;
    for (const row of rows) {
      try {
        await publishToSqs({
          eventId: row.event_id,
          eventType: row.event_type,
          groupId: row.group_id,
          body: row.body,
        });
        await client.query('UPDATE outbox SET sent_at = now(), attempts = attempts + 1 WHERE id = $1', [
          row.id,
        ]);
        sent += 1;
      } catch (err) {
        await client.query('UPDATE outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1', [
          row.id,
          String(err),
        ]);
        // Stop here: a later event for the same PO must never overtake this one.
        break;
      }
    }
    await client.query('COMMIT');
    return sent;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function startOutboxRelay(intervalMs = 2_000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    relayOutboxBatch()
      .catch((err) => console.error('outbox relay failed', err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
