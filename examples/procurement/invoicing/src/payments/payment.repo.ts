import type { Currency } from '@northwind/contracts';
import type { Db } from '@/db/pool';

export interface PaymentRow {
  id: string;
  invoiceId: string;
  status: 'pending' | 'succeeded' | 'failed';
  idempotencyKey: string;
  amountCents: number;
  stripeTransferId: string | null;
}

export interface ClaimInput {
  invoiceId: string;
  runId: string;
  idempotencyKey: string;
  amountCents: number;
  currency: Currency;
}

function toPayment(r: Record<string, any>): PaymentRow {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    status: r.status,
    idempotencyKey: r.idempotency_key,
    amountCents: r.amount_cents,
    stripeTransferId: r.stripe_transfer_id,
  };
}

/**
 * Returns the single payment row for an invoice, creating it if needed. A pending row left by a
 * crashed or timed-out run is handed back so the payout is retried with the same idempotency key.
 */
export async function claimPayment(db: Db, input: ClaimInput): Promise<PaymentRow> {
  const { rows } = await db.query(
    `INSERT INTO payments (invoice_id, payment_run_id, idempotency_key, amount_cents, currency, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (invoice_id) DO UPDATE SET payment_run_id = EXCLUDED.payment_run_id, updated_at = now()
       WHERE payments.status = 'pending'
     RETURNING *`,
    [input.invoiceId, input.runId, input.idempotencyKey, input.amountCents, input.currency],
  );
  const row =
    rows[0] ?? (await db.query('SELECT * FROM payments WHERE invoice_id = $1', [input.invoiceId])).rows[0];
  const payment = toPayment(row);
  if (payment.amountCents !== input.amountCents) {
    throw new Error(`invoice ${input.invoiceId} changed amount after its payment was claimed`);
  }
  return payment;
}

export async function markPaymentSucceeded(db: Db, paymentId: string, transferId: string): Promise<void> {
  await db.query(
    "UPDATE payments SET status = 'succeeded', stripe_transfer_id = $2, updated_at = now() WHERE id = $1 AND status = 'pending'",
    [paymentId, transferId],
  );
}

export async function markPaymentFailed(db: Db, paymentId: string, message: string): Promise<void> {
  await db.query(
    "UPDATE payments SET status = 'failed', failure_message = $2, updated_at = now() WHERE id = $1 AND status = 'pending'",
    [paymentId, message],
  );
}
