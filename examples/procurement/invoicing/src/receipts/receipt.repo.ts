import type { GoodsReceipt } from '@northwind/contracts';
import type { Db } from '@/db/pool';

export async function insertReceipt(db: Db, receipt: GoodsReceipt): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO goods_receipts (id, purchase_order_id, lines, received_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
    [receipt.id, receipt.purchaseOrderId, JSON.stringify(receipt.lines), receipt.receivedAt],
  );
  return (rowCount ?? 0) > 0;
}

export async function receivedQuantities(db: Db, poId: string): Promise<Map<number, number>> {
  const { rows } = await db.query<{ line_no: number; received: number }>(
    `SELECT l."lineNo" AS line_no, SUM(l."quantityReceived")::int AS received
       FROM goods_receipts g, jsonb_to_recordset(g.lines) AS l("lineNo" int, "quantityReceived" int)
      WHERE g.purchase_order_id = $1 GROUP BY l."lineNo"`,
    [poId],
  );
  return new Map(rows.map((r) => [r.line_no, r.received]));
}
