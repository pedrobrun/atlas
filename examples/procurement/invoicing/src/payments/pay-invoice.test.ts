import assert from 'node:assert/strict';
import { test } from 'node:test';
import { payInvoice, type PayableInvoice, type PaymentDeps } from './pay-invoice';
import type { PaymentRow } from './payment.repo';
import type { TransferResult } from './stripe-payouts';

const invoice: PayableInvoice = {
  id: '5b0c7f0e-3c55-4d7e-9a43-6c1f0f7d2b11',
  invoiceNumber: 'INV-88172',
  vendorId: '1f9a3b52-8a8e-4f7c-b1f5-2e8f6b6d0c42',
  currency: 'USD',
  totalCents: 435_000,
};

/** In-memory stand-ins for the payments table (unique per invoice) and Stripe (idempotent per key). */
function harness(stripeFailures: TransferResult[] = []) {
  const payments = new Map<string, PaymentRow>();
  const stripeByKey = new Map<string, string>();
  const transferCalls: string[] = [];
  const invoiceStatus = new Map<string, string>();

  const deps: PaymentDeps = {
    async claim(input) {
      const existing = payments.get(input.invoiceId);
      if (existing) return existing;
      const row: PaymentRow = {
        id: `pay-${payments.size + 1}`,
        invoiceId: input.invoiceId,
        status: 'pending',
        idempotencyKey: input.idempotencyKey,
        amountCents: input.amountCents,
        stripeTransferId: null,
      };
      payments.set(input.invoiceId, row);
      return row;
    },
    async transfer(req) {
      transferCalls.push(req.idempotencyKey);
      const failure = stripeFailures.shift();
      if (failure) return failure;
      const transferId = stripeByKey.get(req.idempotencyKey) ?? `tr_${stripeByKey.size + 1}`;
      stripeByKey.set(req.idempotencyKey, transferId);
      return { ok: true, transferId };
    },
    async markSucceeded(paymentId, transferId) {
      for (const row of payments.values())
        if (row.id === paymentId && row.status === 'pending')
          Object.assign(row, { status: 'succeeded', stripeTransferId: transferId });
    },
    async markFailed(paymentId) {
      for (const row of payments.values())
        if (row.id === paymentId && row.status === 'pending') row.status = 'failed';
    },
    async markInvoicePaid(invoiceId) {
      invoiceStatus.set(invoiceId, 'paid');
    },
    async markInvoiceFailed(invoiceId) {
      invoiceStatus.set(invoiceId, 'exception');
    },
  };
  return { deps, stripeByKey, transferCalls, invoiceStatus };
}

test('paying the same invoice twice creates one transfer', async () => {
  const h = harness();
  assert.equal(await payInvoice(invoice, 'acct_1Nw', 'run-1', h.deps), 'paid');
  assert.equal(await payInvoice(invoice, 'acct_1Nw', 'run-2', h.deps), 'already_paid');
  assert.equal(h.transferCalls.length, 1);
  assert.equal(h.stripeByKey.size, 1);
});

test('a transient Stripe error is retried under the same idempotency key', async () => {
  const h = harness([{ ok: false, retryable: true, message: 'socket hang up' }]);
  assert.equal(await payInvoice(invoice, 'acct_1Nw', 'run-1', h.deps), 'retry_later');
  assert.equal(await payInvoice(invoice, 'acct_1Nw', 'run-2', h.deps), 'paid');
  assert.equal(new Set(h.transferCalls).size, 1, 'both attempts must use one key');
  assert.equal(h.stripeByKey.size, 1);
});

test('two concurrent runs for one invoice produce a single Stripe transfer', async () => {
  const h = harness();
  const outcomes = await Promise.all([
    payInvoice(invoice, 'acct_1Nw', 'run-a', h.deps),
    payInvoice(invoice, 'acct_1Nw', 'run-b', h.deps),
  ]);
  assert.ok(outcomes.every((o) => o === 'paid' || o === 'already_paid'));
  assert.equal(h.stripeByKey.size, 1);
});

test('a definitive failure parks the invoice and is never retried automatically', async () => {
  const h = harness([{ ok: false, retryable: false, message: 'invalid_request_error: No such destination' }]);
  assert.equal(await payInvoice(invoice, 'acct_gone', 'run-1', h.deps), 'failed');
  assert.equal(h.invoiceStatus.get(invoice.id), 'exception');
  assert.equal(await payInvoice(invoice, 'acct_gone', 'run-2', h.deps), 'failed');
  assert.equal(h.transferCalls.length, 1);
});
