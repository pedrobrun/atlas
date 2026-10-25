import type { InvoiceSummary, PaidInvoice } from '@northwind/contracts';
import type { Db } from '@/db/pool';

export async function listMatchedUnconfirmed(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM invoices WHERE status = 'matched' AND budget_confirmed_at IS NULL LIMIT 500",
  );
  return rows.map((r) => r.id);
}

export async function listAwaitingMatch(db: Db): Promise<InvoiceSummary[]> {
  const { rows } = await db.query(
    `SELECT i.*, e.id AS exception_id, e.reason, e.details FROM invoices i
       LEFT JOIN invoice_exceptions e ON e.invoice_id = i.id AND e.status = 'open'
      WHERE i.status IN ('received', 'extracted', 'exception') ORDER BY i.created_at LIMIT 500`,
  );
  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    purchaseOrderNumber: r.purchase_order_number,
    currency: r.currency,
    totalCents: r.total_cents,
    status: r.status,
    dueDate: r.due_date,
    receivedAt: r.created_at.toISOString(),
    openException: r.exception_id ? { id: r.exception_id, reason: r.reason, details: r.details } : null,
  }));
}

export async function listPaidSince(db: Db, since: Date, limit: number): Promise<PaidInvoice[]> {
  const { rows } = await db.query(
    `SELECT i.id, i.invoice_number, i.vendor_id, i.purchase_order_id, i.purchase_order_number, i.currency,
            i.subtotal_cents, i.tax_cents, i.total_cents, i.paid_at, p.stripe_transfer_id
       FROM invoices i JOIN payments p ON p.invoice_id = i.id AND p.status = 'succeeded'
      WHERE i.status = 'paid' AND i.paid_at > $1 ORDER BY i.paid_at, i.id LIMIT $2`,
    [since, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    vendorId: r.vendor_id,
    purchaseOrderId: r.purchase_order_id,
    purchaseOrderNumber: r.purchase_order_number,
    currency: r.currency,
    subtotalCents: r.subtotal_cents,
    taxCents: r.tax_cents,
    totalCents: r.total_cents,
    paidAt: r.paid_at.toISOString(),
    stripeTransferId: r.stripe_transfer_id,
  }));
}

export async function findIdBySha(db: Db, sha256: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM invoices WHERE sha256 = $1', [sha256]);
  return rows[0]?.id ?? null;
}

export async function findIdByVendorInvoiceNumber(
  db: Db,
  vendorId: string,
  invoiceNumber: string,
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM invoices WHERE vendor_id = $1 AND invoice_number = $2',
    [vendorId, invoiceNumber],
  );
  return rows[0]?.id ?? null;
}

export async function billedSoFar(db: Db, poId: string, excludeInvoiceId: string) {
  const { rows } = await db.query<{ line_no: number | null; quantity: number; subtotal: number }>(
    `SELECT (l->>'poLineNo')::int AS line_no, SUM((l->>'quantity')::int)::int AS quantity,
            SUM((l->>'quantity')::bigint * (l->>'unitPriceCents')::bigint)::bigint AS subtotal
       FROM invoices i, jsonb_array_elements(i.lines) l
      WHERE i.purchase_order_id = $1 AND i.id <> $2 AND i.status IN ('matched', 'paying', 'paid')
      GROUP BY 1`,
    [poId, excludeInvoiceId],
  );
  const quantities = new Map<number, number>();
  let subtotalCents = 0;
  for (const r of rows) {
    if (r.line_no !== null) quantities.set(r.line_no, r.quantity);
    subtotalCents += r.subtotal;
  }
  return { quantities, subtotalCents };
}
