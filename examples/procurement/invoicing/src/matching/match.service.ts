import { pool, withTransaction } from '@/db/pool';
import { ProcureApiError, reportInvoiced } from '@/clients/procure-api';
import { closeException, findRematchable, openException } from '@/exceptions/exception.repo';
import { billedSoFar, listMatchedUnconfirmed } from '@/invoices/invoice-queries';
import * as invoices from '@/invoices/invoice.repo';
import { findMirror } from '@/purchase-orders/po-mirror.repo';
import { receivedQuantities } from '@/receipts/receipt.repo';
import { threeWayMatch } from './three-way-match';
import { loadToleranceRules } from './tolerance';

export type MatchOutcome = 'matched' | 'exception';

export async function runMatch(invoiceId: string): Promise<MatchOutcome> {
  const outcome = await withTransaction(async (client): Promise<MatchOutcome> => {
    const invoice = await invoices.findInvoice(client, invoiceId, { forUpdate: true });
    if (!invoice || invoice.status !== 'extracted') return 'exception';

    const park = async (reason: Parameters<typeof openException>[2], details: unknown) => {
      await openException(client, invoiceId, reason, details);
      await invoices.transitionInvoice(client, invoiceId, ['extracted'], 'exception', reason);
      return 'exception' as const;
    };

    if (!invoice.purchaseOrderNumber) return park('no_purchase_order', {});
    const po = invoice.purchaseOrderId ? await findMirror(client, invoice.purchaseOrderId) : null;
    if (!po) return park('purchase_order_not_synced', { purchaseOrderNumber: invoice.purchaseOrderNumber });

    const result = threeWayMatch({
      po,
      receivedByLine: await receivedQuantities(client, po.id),
      billedBefore: await billedSoFar(client, po.id, invoiceId),
      invoice: { currency: invoice.currency!, subtotalCents: invoice.subtotalCents!, lines: invoice.lines },
      tolerance: loadToleranceRules(),
    });
    await client.query('INSERT INTO match_results (invoice_id, outcome, variances) VALUES ($1, $2, $3)', [
      invoiceId,
      result.outcome,
      JSON.stringify(result.variances),
    ]);
    if (result.outcome === 'exception') return park('match_variance', { variances: result.variances });

    await invoices.transitionInvoice(client, invoiceId, ['extracted'], 'matched', 'three-way match passed');
    return 'matched';
  });

  if (outcome === 'matched') await confirmBudgetConsumption(invoiceId);
  return outcome;
}

/**
 * Tells procure-api to consume budget for a matched invoice. Network failures leave the invoice
 * unconfirmed and the payment run retries; a rejection parks the invoice for finance.
 */
export async function confirmBudgetConsumption(invoiceId: string): Promise<void> {
  const invoice = await invoices.findInvoice(pool, invoiceId);
  if (!invoice || invoice.status !== 'matched' || invoice.budgetConfirmedAt || !invoice.purchaseOrderId)
    return;
  try {
    await reportInvoiced(invoice.purchaseOrderId, {
      invoiceId,
      amountCents: invoice.subtotalCents!,
      currency: invoice.currency!,
    });
    await invoices.markBudgetConfirmed(pool, invoiceId);
  } catch (err) {
    if (!(err instanceof ProcureApiError) || !err.isRejection) {
      console.warn(`budget confirmation for ${invoiceId} deferred`, err);
      return;
    }
    await withTransaction(async (client) => {
      await openException(client, invoiceId, 'budget_rejected', { status: err.status, body: err.body });
      await invoices.transitionInvoice(
        client,
        invoiceId,
        ['matched'],
        'exception',
        'procure-api rejected budget consumption',
      );
    });
  }
}

export async function confirmPendingBudgetConsumption(): Promise<void> {
  for (const id of await listMatchedUnconfirmed(pool)) await confirmBudgetConsumption(id);
}

export async function rematchForPurchaseOrder(poId: string): Promise<number> {
  let rematched = 0;
  for (const { invoiceId, exceptionId } of await findRematchable(pool, poId)) {
    await withTransaction(async (client) => {
      await closeException(
        client,
        exceptionId,
        'superseded',
        'system:rematch',
        'new PO or receipt data arrived',
      );
      await invoices.transitionInvoice(
        client,
        invoiceId,
        ['exception'],
        'extracted',
        'rematch after PO update',
      );
    });
    await runMatch(invoiceId);
    rematched += 1;
  }
  return rematched;
}
