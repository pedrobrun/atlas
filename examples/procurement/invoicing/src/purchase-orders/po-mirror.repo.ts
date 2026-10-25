import type { Currency, PurchaseOrder, PurchaseOrderLine } from '@northwind/contracts';
import type { Db } from '@/db/pool';

export interface MirroredPurchaseOrder {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  currency: Currency;
  totalCents: number;
  status: PurchaseOrder['status'];
  version: number;
  lines: PurchaseOrderLine[];
}

function toMirror(r: Record<string, any>): MirroredPurchaseOrder {
  return {
    id: r.id,
    number: r.number,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    currency: r.currency,
    totalCents: r.total_cents,
    status: r.status,
    version: r.version,
    lines: r.lines,
  };
}

/** Applies a PO snapshot unless we already hold the same or a newer version (redelivery, replays). */
export async function upsertPurchaseOrder(db: Db, po: PurchaseOrder): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO po_mirror (id, number, vendor_id, vendor_name, currency, total_cents, status, version, lines)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET total_cents = EXCLUDED.total_cents, status = EXCLUDED.status, version = EXCLUDED.version,
       lines = EXCLUDED.lines, vendor_name = EXCLUDED.vendor_name, updated_at = now()
     WHERE po_mirror.version < EXCLUDED.version`,
    [
      po.id,
      po.number,
      po.vendorId,
      po.vendorName,
      po.currency,
      po.totalCents,
      po.status,
      po.version,
      JSON.stringify(po.lines),
    ],
  );
  return (rowCount ?? 0) > 0;
}

export async function markCancelled(db: Db, poId: string): Promise<void> {
  await db.query("UPDATE po_mirror SET status = 'cancelled', updated_at = now() WHERE id = $1", [poId]);
}

export async function findMirror(db: Db, poId: string): Promise<MirroredPurchaseOrder | null> {
  const { rows } = await db.query('SELECT * FROM po_mirror WHERE id = $1', [poId]);
  return rows[0] ? toMirror(rows[0]) : null;
}

export async function findMirrorByNumber(db: Db, number: string): Promise<MirroredPurchaseOrder | null> {
  const { rows } = await db.query('SELECT * FROM po_mirror WHERE number = $1', [number]);
  return rows[0] ? toMirror(rows[0]) : null;
}
