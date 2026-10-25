import { centsToDecimalString, type PaidInvoice, type PurchaseOrder } from '@northwind/contracts';

/** A record that cannot be mapped will not map on retry either; the ledger marks it dead. */
export class MappingError extends Error {}

export const poExternalId = (poId: string) => `nw-po-${poId}`;
export const billExternalId = (invoiceId: string) => `nw-bill-${invoiceId}`;
export const paymentExternalId = (invoiceId: string) => `nw-pay-${invoiceId}`;

export function toNetSuitePurchaseOrder(po: PurchaseOrder, accountIdByNumber: ReadonlyMap<string, string>) {
  if (!po.vendorExternalId) throw new MappingError(`vendor ${po.vendorId} has no NetSuite id`);
  if (!po.costCenterExternalId) throw new MappingError(`cost center ${po.costCenterCode} has no NetSuite id`);
  return {
    externalId: poExternalId(po.id),
    tranId: po.number,
    entity: { id: po.vendorExternalId },
    subsidiary: { id: process.env.NETSUITE_SUBSIDIARY_ID ?? '1' },
    department: { id: po.costCenterExternalId },
    currency: { refName: po.currency },
    tranDate: po.issuedAt.slice(0, 10),
    memo: `Northwind ${po.number} v${po.version}`,
    expense: {
      items: po.lines.map((line) => {
        const account = line.glAccountNumber ? accountIdByNumber.get(line.glAccountNumber) : undefined;
        if (!account)
          throw new MappingError(
            `${po.number} line ${line.lineNo}: GL account ${line.glAccountNumber ?? '(none)'} not in NetSuite`,
          );
        return {
          account: { id: account },
          amount: centsToDecimalString(line.quantity * line.unitPriceCents),
          memo: `${line.quantity} x ${line.description}`,
          department: { id: po.costCenterExternalId },
          isClosed: po.status === 'cancelled',
        };
      }),
    },
  };
}

export function toNetSuiteBillTransform(invoice: PaidInvoice) {
  return {
    externalId: billExternalId(invoice.id),
    tranId: invoice.invoiceNumber,
    tranDate: invoice.paidAt.slice(0, 10),
    memo: `Northwind invoice ${invoice.invoiceNumber} against ${invoice.purchaseOrderNumber}`,
  };
}

export function toNetSuiteVendorPayment(
  invoice: PaidInvoice,
  billInternalId: string,
  vendorInternalId: string,
) {
  const bankAccount = process.env.NETSUITE_AP_BANK_ACCOUNT_ID;
  if (!bankAccount) throw new MappingError('NETSUITE_AP_BANK_ACCOUNT_ID is not set');
  return {
    externalId: paymentExternalId(invoice.id),
    entity: { id: vendorInternalId },
    account: { id: bankAccount },
    currency: { refName: invoice.currency },
    tranDate: invoice.paidAt.slice(0, 10),
    memo: `Stripe transfer ${invoice.stripeTransferId}`,
    apply: {
      items: [{ doc: { id: billInternalId }, apply: true, amount: centsToDecimalString(invoice.totalCents) }],
    },
  };
}
