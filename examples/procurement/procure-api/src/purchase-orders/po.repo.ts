import type { PurchaseOrder, PurchaseOrderLine } from '@northwind/contracts';
import type { Db, TxClient } from '@/db/pool';

const SELECT_PO = `
  SELECT p.id, p.number, p.requisition_id, p.vendor_id, v.legal_name AS vendor_name, v.netsuite_id AS vendor_netsuite_id,
         p.cost_center_id, c.code AS cost_center_code, c.netsuite_id AS cost_center_netsuite_id,
         p.currency, p.total_cents, p.invoiced_cents, p.status, p.version, p.issued_at, p.updated_at
    FROM purchase_orders p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN cost_centers c ON c.id = p.cost_center_id`;

async function linesFor(db: Db, ids: string[]): Promise<Map<string, PurchaseOrderLine[]>> {
  const { rows } = await db.query(
    'SELECT * FROM purchase_order_lines WHERE purchase_order_id = ANY($1) ORDER BY purchase_order_id, line_no',
    [ids],
  );
  const byPo = new Map<string, PurchaseOrderLine[]>();
  for (const r of rows) {
    const line = {
      lineNo: r.line_no,
      description: r.description,
      categoryCode: r.category_code,
      quantity: r.quantity,
      unitPriceCents: r.unit_price_cents,
      glAccountNumber: r.gl_account_number,
    };
    byPo.set(r.purchase_order_id, [...(byPo.get(r.purchase_order_id) ?? []), line]);
  }
  return byPo;
}

function toPurchaseOrder(r: Record<string, any>, lines: PurchaseOrderLine[]): PurchaseOrder {
  return {
    id: r.id,
    number: r.number,
    requisitionId: r.requisition_id,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    vendorExternalId: r.vendor_netsuite_id,
    costCenterId: r.cost_center_id,
    costCenterCode: r.cost_center_code,
    costCenterExternalId: r.cost_center_netsuite_id,
    currency: r.currency,
    totalCents: r.total_cents,
    invoicedCents: r.invoiced_cents,
    status: r.status,
    version: r.version,
    lines,
    issuedAt: r.issued_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function findPurchaseOrder(db: Db, id: string, opts: { forUpdate?: boolean } = {}) {
  const lock = opts.forUpdate ? ' FOR UPDATE OF p' : '';
  const { rows } = await db.query(`${SELECT_PO} WHERE p.id = $1${lock}`, [id]);
  if (!rows[0]) return null;
  return toPurchaseOrder(rows[0], (await linesFor(db, [id])).get(id) ?? []);
}

export async function listUpdatedSince(db: Db, since: Date, limit: number): Promise<PurchaseOrder[]> {
  const { rows } = await db.query(
    `${SELECT_PO} WHERE p.updated_at > $1 ORDER BY p.updated_at, p.id LIMIT $2`,
    [since, limit],
  );
  const ids = rows.map((r) => r.id);
  const lines = await linesFor(db, ids);
  return rows.map((r) => toPurchaseOrder(r, lines.get(r.id) ?? []));
}

export type NewPurchaseOrder = Pick<
  PurchaseOrder,
  'requisitionId' | 'vendorId' | 'costCenterId' | 'currency' | 'totalCents'
>;

export async function insertPurchaseOrder(client: TxClient, po: NewPurchaseOrder): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO purchase_orders (number, requisition_id, vendor_id, cost_center_id, currency, total_cents)
     VALUES ('PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('po_number_seq')::text, 6, '0'), $1, $2, $3, $4, $5)
     RETURNING id`,
    [po.requisitionId, po.vendorId, po.costCenterId, po.currency, po.totalCents],
  );
  return rows[0]!.id;
}

const LINE_COLUMNS = [
  'lineNo',
  'description',
  'categoryCode',
  'quantity',
  'unitPriceCents',
  'glAccountNumber',
] as const;

export async function replaceLines(client: TxClient, poId: string, lines: readonly PurchaseOrderLine[]) {
  await client.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [poId]);
  await client.query(
    `INSERT INTO purchase_order_lines (purchase_order_id, line_no, description, category_code, quantity, unit_price_cents, gl_account_number)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::int[], $6::bigint[], $7::text[])`,
    [poId, ...LINE_COLUMNS.map((key) => lines.map((line) => line[key]))],
  );
}

export async function setTotalAndBumpVersion(client: TxClient, poId: string, totalCents: number) {
  await client.query(
    'UPDATE purchase_orders SET total_cents = $2, version = version + 1, updated_at = now() WHERE id = $1',
    [poId, totalCents],
  );
}

export async function addInvoiced(client: TxClient, poId: string, amountCents: number) {
  await client.query(
    'UPDATE purchase_orders SET invoiced_cents = invoiced_cents + $2, updated_at = now() WHERE id = $1',
    [poId, amountCents],
  );
}
