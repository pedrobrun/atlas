import type { Currency, InvoiceStatus } from '@northwind/contracts';

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  poLineNo: number | null;
}

export interface Invoice {
  id: string;
  source: 'email' | 'upload';
  s3Key: string;
  vendorId: string | null;
  vendorName: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  invoiceNumber: string | null;
  currency: Currency | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  lines: InvoiceLine[];
  issueDate: string | null;
  dueDate: string | null;
  status: InvoiceStatus;
  budgetConfirmedAt: Date | null;
  createdAt: Date;
}

export function toInvoice(r: Record<string, any>): Invoice {
  return {
    id: r.id,
    source: r.source,
    s3Key: r.s3_key,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    purchaseOrderId: r.purchase_order_id,
    purchaseOrderNumber: r.purchase_order_number,
    invoiceNumber: r.invoice_number,
    currency: r.currency,
    subtotalCents: r.subtotal_cents,
    taxCents: r.tax_cents,
    totalCents: r.total_cents,
    lines: r.lines,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    status: r.status,
    budgetConfirmedAt: r.budget_confirmed_at,
    createdAt: r.created_at,
  };
}
