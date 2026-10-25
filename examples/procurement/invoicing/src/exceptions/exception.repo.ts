import type { ExceptionReason } from '@northwind/contracts';
import type { Db } from '@/db/pool';

export interface InvoiceException {
  id: string;
  invoiceId: string;
  reason: ExceptionReason;
  details: unknown;
  status: 'open' | 'resolved' | 'rejected' | 'superseded';
}

export async function openException(
  db: Db,
  invoiceId: string,
  reason: ExceptionReason,
  details: unknown,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO invoice_exceptions (invoice_id, reason, details) VALUES ($1, $2, $3)
     ON CONFLICT (invoice_id) WHERE status = 'open' DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details
     RETURNING id`,
    [invoiceId, reason, JSON.stringify(details ?? {})],
  );
  return rows[0]!.id;
}

export async function lockException(db: Db, id: string): Promise<InvoiceException | null> {
  const { rows } = await db.query(
    'SELECT id, invoice_id, reason, details, status FROM invoice_exceptions WHERE id = $1 FOR UPDATE',
    [id],
  );
  const r = rows[0];
  return r
    ? { id: r.id, invoiceId: r.invoice_id, reason: r.reason, details: r.details, status: r.status }
    : null;
}

export async function closeException(
  db: Db,
  id: string,
  status: 'resolved' | 'rejected' | 'superseded',
  actor: string,
  note: string,
) {
  await db.query(
    'UPDATE invoice_exceptions SET status = $2, resolved_by = $3, resolution_note = $4, resolved_at = now() WHERE id = $1',
    [id, status, actor, note],
  );
}

/** Invoices parked for reasons a later PO or receipt event can fix. */
export async function findRematchable(
  db: Db,
  poId: string,
): Promise<{ invoiceId: string; exceptionId: string }[]> {
  const { rows } = await db.query<{ invoice_id: string; id: string }>(
    `SELECT e.invoice_id, e.id FROM invoice_exceptions e JOIN invoices i ON i.id = e.invoice_id
      WHERE i.purchase_order_id = $1 AND i.status = 'exception' AND e.status = 'open'
        AND e.reason IN ('purchase_order_not_synced', 'match_variance')`,
    [poId],
  );
  return rows.map((r) => ({ invoiceId: r.invoice_id, exceptionId: r.id }));
}
