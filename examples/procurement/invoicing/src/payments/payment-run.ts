import type { Currency, PayoutAccount } from '@northwind/contracts';
import { getPayoutAccount } from '@/clients/procure-api';
import { pool, withTransaction } from '@/db/pool';
import { ConflictError } from '@/errors';
import { openException } from '@/exceptions/exception.repo';
import { transitionInvoice } from '@/invoices/invoice.repo';
import { confirmPendingBudgetConsumption } from '@/matching/match.service';
import { payInvoice, type PayableInvoice, type PaymentDeps } from './pay-invoice';
import { claimPayment, markPaymentFailed, markPaymentSucceeded } from './payment.repo';
import { createVendorTransfer } from './stripe-payouts';

const deps: PaymentDeps = {
  claim: (input) => claimPayment(pool, input),
  transfer: createVendorTransfer,
  markSucceeded: (id, transferId) => markPaymentSucceeded(pool, id, transferId),
  markFailed: (id, message) => markPaymentFailed(pool, id, message),
  markInvoicePaid: async (invoiceId, transferId) => {
    await transitionInvoice(pool, invoiceId, ['paying'], 'paid', `stripe transfer ${transferId}`).catch(
      (err) => {
        // Already paid by a concurrent run; the payments row is the source of truth.
        if (!(err instanceof ConflictError)) throw err;
      },
    );
  },
  markInvoiceFailed: (invoiceId, message) =>
    withTransaction(async (client) => {
      await openException(client, invoiceId, 'payment_failed', { message });
      await transitionInvoice(client, invoiceId, ['paying'], 'exception', 'payout failed');
    }),
};

export interface RunSummary {
  runId: string;
  paid: number;
  alreadyPaid: number;
  retryLater: number;
  failed: number;
  skipped: number;
  paidCents: Partial<Record<Currency, number>>;
}

async function listPayable(horizon: Date): Promise<PayableInvoice[]> {
  const { rows } = await pool.query(
    `SELECT id, invoice_number, vendor_id, currency, total_cents FROM invoices
      WHERE status IN ('matched', 'paying') AND budget_confirmed_at IS NOT NULL AND vendor_id IS NOT NULL
        AND COALESCE(due_date, created_at::date) <= $1::date
      ORDER BY due_date NULLS FIRST, id`,
    [horizon],
  );
  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    vendorId: r.vendor_id,
    currency: r.currency,
    totalCents: r.total_cents,
  }));
}

export async function runPaymentRun(now = new Date()): Promise<RunSummary> {
  await confirmPendingBudgetConsumption();
  const { rows } = await pool.query<{ id: string }>('INSERT INTO payment_runs DEFAULT VALUES RETURNING id');
  const runId = rows[0]!.id;
  const summary: RunSummary = {
    runId,
    paid: 0,
    alreadyPaid: 0,
    retryLater: 0,
    failed: 0,
    skipped: 0,
    paidCents: {},
  };

  const horizonDays = Number(process.env.PAYMENT_RUN_HORIZON_DAYS ?? 3);
  const accounts = new Map<string, PayoutAccount | null>();
  for (const invoice of await listPayable(new Date(now.getTime() + horizonDays * 86_400_000))) {
    if (!accounts.has(invoice.vendorId))
      accounts.set(invoice.vendorId, await getPayoutAccount(invoice.vendorId).catch(() => null));
    const account = accounts.get(invoice.vendorId);
    // Suspended vendors and currency mismatches wait for finance; they are not failures.
    if (!account || account.vendorStatus !== 'active' || account.payoutCurrency !== invoice.currency) {
      summary.skipped += 1;
      continue;
    }

    await transitionInvoice(pool, invoice.id, ['matched', 'paying'], 'paying', `payment run ${runId}`);
    const outcome = await payInvoice(invoice, account.stripeAccountId, runId, deps);
    if (outcome === 'paid') {
      summary.paid += 1;
      summary.paidCents[invoice.currency] = (summary.paidCents[invoice.currency] ?? 0) + invoice.totalCents;
    } else if (outcome === 'already_paid') summary.alreadyPaid += 1;
    else if (outcome === 'retry_later') summary.retryLater += 1;
    else summary.failed += 1;
  }

  await pool.query('UPDATE payment_runs SET finished_at = now(), summary = $2 WHERE id = $1', [
    runId,
    JSON.stringify(summary),
  ]);
  return summary;
}
