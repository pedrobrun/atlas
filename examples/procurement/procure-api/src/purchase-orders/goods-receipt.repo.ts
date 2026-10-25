import type { Db, TxClient } from '@/db/pool';

export interface ReceiptLine {
  lineNo: number;
  quantityReceived: number;
}

export async function receivedQuantities(db: Db, poId: string): Promise<Map<number, number>> {
  const { rows } = await db.query<{ line_no: number; received: number }>(
    `SELECT l.line_no, SUM(l.quantity_received)::int AS received
       FROM goods_receipt_lines l JOIN goods_receipts g ON g.id = l.goods_receipt_id
      WHERE g.purchase_order_id = $1 GROUP BY l.line_no`,
    [poId],
  );
  return new Map(rows.map((r) => [r.line_no, r.received]));
}

export async function insertGoodsReceipt(
  client: TxClient,
  poId: string,
  receivedBy: string,
  lines: readonly ReceiptLine[],
): Promise<{ id: string; receivedAt: Date }> {
  const { rows } = await client.query<{ id: string; received_at: Date }>(
    'INSERT INTO goods_receipts (purchase_order_id, received_by) VALUES ($1, $2) RETURNING id, received_at',
    [poId, receivedBy],
  );
  const receipt = rows[0]!;
  await client.query(
    `INSERT INTO goods_receipt_lines (goods_receipt_id, line_no, quantity_received)
     SELECT $1, * FROM unnest($2::int[], $3::int[])`,
    [receipt.id, lines.map((l) => l.lineNo), lines.map((l) => l.quantityReceived)],
  );
  return { id: receipt.id, receivedAt: receipt.received_at };
}
