import type { Currency, InvoiceStatus } from '@northwind/contracts';
import type { Db } from '@/db/pool';
import { ConflictError } from '@/errors';
import { toInvoice, type Invoice, type InvoiceLine } from './invoice.types';

export interface NewInvoice {
  source: 'email' | 'upload';
  s3Key: string;
  sha256: string;
  submittedBy: string;
  status: Extract<InvoiceStatus, 'received' | 'extracted'>;
  vendorId?: string | null;
  vendorName?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderNumber?: string | null;
  invoiceNumber?: string | null;
  currency?: Currency | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
  lines?: InvoiceLine[];
  issueDate?: string | null;
  dueDate?: string | null;
  extractionConfidence?: number | null;
}

export async function insertInvoice(db: Db, i: NewInvoice): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO invoices (source, s3_key, sha256, submitted_by, status, vendor_id, vendor_name, purchase_order_id,
       purchase_order_number, invoice_number, currency, subtotal_cents, tax_cents, total_cents, lines, issue_date, due_date, extraction_confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
    [
      i.source,
      i.s3Key,
      i.sha256,
      i.submittedBy,
      i.status,
      i.vendorId ?? null,
      i.vendorName ?? null,
      i.purchaseOrderId ?? null,
      i.purchaseOrderNumber ?? null,
      i.invoiceNumber ?? null,
      i.currency ?? null,
      i.subtotalCents ?? null,
      i.taxCents ?? null,
      i.totalCents ?? null,
      JSON.stringify(i.lines ?? []),
      i.issueDate ?? null,
      i.dueDate ?? null,
      i.extractionConfidence ?? null,
    ],
  );
  return rows[0]!.id;
}

export async function findInvoice(
  db: Db,
  id: string,
  opts: { forUpdate?: boolean } = {},
): Promise<Invoice | null> {
  const { rows } = await db.query(
    `SELECT * FROM invoices WHERE id = $1${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ? toInvoice(rows[0]) : null;
}

/** Atomic compare-and-set on status that also records the history row. */
export async function transitionInvoice(
  db: Db,
  id: string,
  from: InvoiceStatus[],
  to: InvoiceStatus,
  reason: string,
): Promise<InvoiceStatus> {
  const { rows } = await db.query<{ from_status: InvoiceStatus }>(
    `WITH prev AS (SELECT id, status FROM invoices WHERE id = $1 FOR UPDATE),
          upd AS (
            UPDATE invoices i SET status = $2, updated_at = now(), paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE i.paid_at END
              FROM prev WHERE i.id = prev.id AND prev.status = ANY($3) RETURNING prev.status AS from_status)
     INSERT INTO invoice_status_history (invoice_id, from_status, to_status, reason)
     SELECT $1, from_status, $2, $4 FROM upd RETURNING from_status`,
    [id, to, from, reason],
  );
  if (!rows[0]) throw new ConflictError(`invoice ${id} is not in ${from.join('/')}; cannot move to ${to}`);
  return rows[0].from_status;
}

export async function linkPurchaseOrder(
  db: Db,
  poNumber: string,
  poId: string,
  vendorId: string,
  vendorName: string,
): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE invoices SET purchase_order_id = $2, vendor_id = COALESCE(vendor_id, $3), vendor_name = COALESCE(vendor_name, $4), updated_at = now()
      WHERE purchase_order_number = $1 AND purchase_order_id IS NULL RETURNING id`,
    [poNumber, poId, vendorId, vendorName],
  );
  return rows.map((r) => r.id);
}
export async function markBudgetConfirmed(db: Db, id: string) {
  await db.query(
    'UPDATE invoices SET budget_confirmed_at = now() WHERE id = $1 AND budget_confirmed_at IS NULL',
    [id],
  );
}
