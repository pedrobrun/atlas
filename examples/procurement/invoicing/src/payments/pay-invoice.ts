import type { Currency } from '@northwind/contracts';
import type { ClaimInput, PaymentRow } from './payment.repo';
import type { TransferRequest, TransferResult } from './stripe-payouts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Stripe idempotency key for an invoice's payout. It is derived from the invoice id and
 * nothing else: a run id, attempt counter or timestamp in the key would let a retried or
 * concurrent run create a second transfer for the same invoice.
 */
export function payoutIdempotencyKey(invoiceId: string): string {
  if (!UUID.test(invoiceId)) throw new Error(`invoice id must be a UUID, got "${invoiceId}"`);
  return `nw-invoice-payout:${invoiceId.toLowerCase()}`;
}

export interface PayableInvoice {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  currency: Currency;
  totalCents: number;
}

export interface PaymentDeps {
  claim(input: ClaimInput): Promise<PaymentRow>;
  transfer(req: TransferRequest): Promise<TransferResult>;
  markSucceeded(paymentId: string, transferId: string): Promise<void>;
  markFailed(paymentId: string, message: string): Promise<void>;
  markInvoicePaid(invoiceId: string, transferId: string): Promise<void>;
  markInvoiceFailed(invoiceId: string, message: string): Promise<void>;
}

export type PayOutcome = 'paid' | 'already_paid' | 'retry_later' | 'failed';

export async function payInvoice(
  invoice: PayableInvoice,
  destinationAccountId: string,
  runId: string,
  deps: PaymentDeps,
): Promise<PayOutcome> {
  const idempotencyKey = payoutIdempotencyKey(invoice.id);
  const payment = await deps.claim({
    invoiceId: invoice.id,
    runId,
    idempotencyKey,
    amountCents: invoice.totalCents,
    currency: invoice.currency,
  });
  if (payment.status === 'succeeded') {
    // A crash between the two writes below leaves the invoice in "paying"; finish it, never re-pay.
    await deps.markInvoicePaid(invoice.id, payment.stripeTransferId!);
    return 'already_paid';
  }
  if (payment.status === 'failed') return 'failed';

  const result = await deps.transfer({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    vendorId: invoice.vendorId,
    destinationAccountId,
    amountCents: payment.amountCents,
    currency: invoice.currency,
    idempotencyKey: payment.idempotencyKey,
  });

  if (result.ok) {
    await deps.markSucceeded(payment.id, result.transferId);
    await deps.markInvoicePaid(invoice.id, result.transferId);
    return 'paid';
  }
  // Transient: the row stays pending and the next run retries under the same key, so Stripe
  // returns the original transfer if this attempt actually went through.
  if (result.retryable) return 'retry_later';

  await deps.markFailed(payment.id, result.message);
  await deps.markInvoiceFailed(invoice.id, result.message);
  return 'failed';
}
