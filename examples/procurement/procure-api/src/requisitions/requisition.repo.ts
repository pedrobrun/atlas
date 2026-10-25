import type { Currency } from '@northwind/contracts';
import type { Db, TxClient } from '@/db/pool';
import {
  toLine,
  toRequisition,
  type Requisition,
  type RequisitionLine,
  type RequisitionLineRow,
  type RequisitionRow,
} from './requisition.types';

const COLUMNS = `id, number, requester_id, cost_center_id, vendor_id, title, justification, currency,
  total_cents, status, needed_by, submitted_at, approved_at, created_at`;

export interface RequisitionHeader {
  requesterId: string;
  costCenterId: string;
  vendorId: string | null;
  title: string;
  justification: string;
  currency: Currency;
  neededBy: string | null;
  totalCents: number;
}

const HEADER_COLUMNS: Record<Exclude<keyof RequisitionHeader, 'requesterId'>, string> = {
  costCenterId: 'cost_center_id',
  vendorId: 'vendor_id',
  title: 'title',
  justification: 'justification',
  currency: 'currency',
  neededBy: 'needed_by',
  totalCents: 'total_cents',
};

export async function insertRequisition(client: TxClient, h: RequisitionHeader): Promise<string> {
  const { requesterId, costCenterId, vendorId, title, justification, currency, neededBy, totalCents } = h;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO requisitions (requester_id, cost_center_id, vendor_id, title, justification, currency, needed_by, total_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [requesterId, costCenterId, vendorId, title, justification, currency, neededBy, totalCents],
  );
  return rows[0]!.id;
}

type HeaderPatch = Partial<Omit<RequisitionHeader, 'requesterId'>>;

export async function updateHeader(client: TxClient, id: string, patch: HeaderPatch) {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as [
    keyof typeof HEADER_COLUMNS,
    unknown,
  ][];
  if (entries.length === 0) return;
  const sets = entries.map(([key], i) => `${HEADER_COLUMNS[key]} = $${i + 2}`);
  await client.query(`UPDATE requisitions SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
    id,
    ...entries.map(([, value]) => value),
  ]);
}

const LINE_COLUMNS = [
  'lineNo',
  'description',
  'categoryCode',
  'quantity',
  'unitPriceCents',
  'catalogItemId',
] as const;

export async function replaceLines(
  client: TxClient,
  requisitionId: string,
  lines: readonly RequisitionLine[],
) {
  await client.query('DELETE FROM requisition_lines WHERE requisition_id = $1', [requisitionId]);
  await client.query(
    `INSERT INTO requisition_lines (requisition_id, line_no, description, category_code, quantity, unit_price_cents, catalog_item_id)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::int[], $6::bigint[], $7::uuid[])`,
    [requisitionId, ...LINE_COLUMNS.map((key) => lines.map((line) => line[key]))],
  );
}

async function linesFor(db: Db, ids: string[]): Promise<Map<string, RequisitionLine[]>> {
  const { rows } = await db.query<RequisitionLineRow>(
    'SELECT * FROM requisition_lines WHERE requisition_id = ANY($1) ORDER BY requisition_id, line_no',
    [ids],
  );
  const byId = new Map<string, RequisitionLine[]>();
  for (const row of rows)
    byId.set(row.requisition_id, [...(byId.get(row.requisition_id) ?? []), toLine(row)]);
  return byId;
}

export async function findRequisition(
  db: Db,
  id: string,
  opts: { forUpdate?: boolean } = {},
): Promise<Requisition | null> {
  const lock = opts.forUpdate ? ' FOR UPDATE' : '';
  const { rows } = await db.query<RequisitionRow>(
    `SELECT ${COLUMNS} FROM requisitions WHERE id = $1${lock}`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const lines = await linesFor(db, [id]);
  return toRequisition(row, lines.get(id) ?? []);
}

export async function listByRequester(db: Db, requesterId: string, limit = 50): Promise<Requisition[]> {
  const { rows } = await db.query<RequisitionRow>(
    `SELECT ${COLUMNS} FROM requisitions WHERE requester_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [requesterId, limit],
  );
  const ids = rows.map((r) => r.id);
  const lines = await linesFor(db, ids);
  return rows.map((row) => toRequisition(row, lines.get(row.id) ?? []));
}
