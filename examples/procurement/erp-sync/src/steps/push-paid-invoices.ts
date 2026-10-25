import type { PaidInvoice } from '@northwind/contracts';
import { internalIdFromLocation, netsuiteRequest } from '@/netsuite/client';
import {
  billExternalId,
  MappingError,
  paymentExternalId,
  poExternalId,
  toNetSuiteBillTransform,
  toNetSuiteVendorPayment,
} from '@/netsuite/mappers';
import { paidInvoicesSince } from '@/sources/invoicing';
import { externalIdFor, getCursor, setCursor } from '@/store/sync-ledger';
import { newReport, syncOnce, type StepReport, type SyncOutcome } from './sync-once';

const CURSOR = 'invoicing.paid_invoices';

async function createBill(invoice: PaidInvoice): Promise<string> {
  // Transforming the PO keeps the bill linked to it in NetSuite (and closes the received lines).
  const response = await netsuiteRequest(
    'POST',
    `/services/rest/record/v1/purchaseOrder/eid:${poExternalId(invoice.purchaseOrderId)}/!transform/vendorBill`,
    {
      body: toNetSuiteBillTransform(invoice),
      idempotencyKey: billExternalId(invoice.id),
    },
  );
  return internalIdFromLocation(response.location);
}

async function createPayment(invoice: PaidInvoice): Promise<string> {
  const billId = await externalIdFor(`bill:${invoice.id}`);
  if (!billId) throw new MappingError(`no NetSuite bill recorded for invoice ${invoice.id}`);
  const bill = await netsuiteRequest<{ entity: { id: string } }>(
    'GET',
    `/services/rest/record/v1/vendorBill/${billId}?fields=entity`,
  );
  if (!bill.body?.entity.id) throw new MappingError(`vendor bill ${billId} has no entity`);
  const response = await netsuiteRequest('POST', '/services/rest/record/v1/vendorPayment', {
    body: toNetSuiteVendorPayment(invoice, billId, bill.body.entity.id),
    idempotencyKey: paymentExternalId(invoice.id),
  });
  return internalIdFromLocation(response.location);
}

export async function pushPaidInvoices(): Promise<StepReport> {
  const report = newReport('push-paid-invoices');
  const since = await getCursor(CURSOR);
  let newest = since;
  let oldestUnsettled: Date | null = null;

  for await (const invoice of paidInvoicesSince(since)) {
    const bill = await syncOnce({
      key: `bill:${invoice.id}`,
      entityType: 'vendor_bill',
      entityId: invoice.id,
      payload: invoice,
      send: () => createBill(invoice),
    });
    const payment: SyncOutcome =
      bill === 'sent' || bill === 'skipped'
        ? await syncOnce({
            key: `payment:${invoice.id}`,
            entityType: 'vendor_payment',
            entityId: invoice.id,
            payload: invoice,
            send: () => createPayment(invoice),
          })
        : bill;

    report.counts[payment] += 1;
    const paidAt = new Date(invoice.paidAt);
    if ((payment === 'failed' || payment === 'waiting') && (!oldestUnsettled || paidAt < oldestUnsettled))
      oldestUnsettled = paidAt;
    if (paidAt > newest) newest = paidAt;
  }

  const next = oldestUnsettled ? new Date(oldestUnsettled.getTime() - 1) : newest;
  if (next > since) await setCursor(CURSOR, next);
  return report;
}
