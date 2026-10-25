import type { Currency } from '@northwind/contracts';
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');

const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });

export interface TransferRequest {
  invoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  destinationAccountId: string;
  amountCents: number;
  currency: Currency;
  idempotencyKey: string;
}

export type TransferResult =
  { ok: true; transferId: string } | { ok: false; retryable: boolean; message: string };

export async function createVendorTransfer(req: TransferRequest): Promise<TransferResult> {
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: req.amountCents,
        currency: req.currency.toLowerCase(),
        destination: req.destinationAccountId,
        transfer_group: `invoice_${req.invoiceId}`,
        description: `Northwind Supply invoice ${req.invoiceNumber}`,
        metadata: { invoice_id: req.invoiceId, vendor_id: req.vendorId },
      },
      { idempotencyKey: req.idempotencyKey },
    );
    return { ok: true, transferId: transfer.id };
  } catch (err) {
    if (
      err instanceof Stripe.errors.StripeConnectionError ||
      err instanceof Stripe.errors.StripeAPIError ||
      err instanceof Stripe.errors.StripeRateLimitError
    ) {
      return { ok: false, retryable: true, message: err.message };
    }
    if (err instanceof Stripe.errors.StripeError) {
      return { ok: false, retryable: false, message: `${err.type}: ${err.message}` };
    }
    throw err;
  }
}
