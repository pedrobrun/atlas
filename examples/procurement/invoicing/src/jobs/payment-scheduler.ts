import { pool } from '@/db/pool';
import { runPaymentRun } from '@/payments/payment-run';

const LOCK_ID = 727_100;

async function alreadyRanToday(now: Date): Promise<boolean> {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM payment_runs WHERE started_at::date = $1::date AND finished_at IS NOT NULL LIMIT 1',
    [now],
  );
  return (rowCount ?? 0) > 0;
}

export async function maybeRunPayments(now = new Date(), force = false): Promise<void> {
  const hour = Number(process.env.PAYMENT_RUN_HOUR_UTC ?? 14);
  if (!force && (now.getUTCHours() !== hour || (await alreadyRanToday(now)))) return;

  const client = await pool.connect();
  try {
    // Several worker replicas run this check; only the lock holder pays.
    const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [
      LOCK_ID,
    ]);
    if (!rows[0]?.locked) return;
    try {
      const summary = await runPaymentRun(now);
      console.info('payment run finished', summary);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

export function startPaymentScheduler(intervalMs = 10 * 60_000): () => void {
  const timer = setInterval(() => {
    maybeRunPayments().catch((err) => console.error('payment run failed', err));
  }, intervalMs);
  return () => clearInterval(timer);
}

if (process.argv.includes('--now')) {
  maybeRunPayments(new Date(), true).finally(() => pool.end());
}
