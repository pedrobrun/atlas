import type { Currency, Requisition, RequisitionLine, RequisitionStatus } from '@northwind/contracts';

export type { Requisition, RequisitionLine };

export interface RequisitionRow {
  id: string;
  number: string;
  requester_id: string;
  cost_center_id: string;
  vendor_id: string | null;
  title: string;
  justification: string;
  currency: Currency;
  total_cents: number;
  status: RequisitionStatus;
  needed_by: string | null;
  submitted_at: Date | null;
  approved_at: Date | null;
  created_at: Date;
}

export interface RequisitionLineRow {
  requisition_id: string;
  line_no: number;
  description: string;
  category_code: string;
  quantity: number;
  unit_price_cents: number;
  catalog_item_id: string | null;
}

export function toLine(row: RequisitionLineRow): RequisitionLine {
  return {
    lineNo: row.line_no,
    description: row.description,
    categoryCode: row.category_code,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    catalogItemId: row.catalog_item_id,
  };
}

export function toRequisition(row: RequisitionRow, lines: RequisitionLine[]): Requisition {
  return {
    id: row.id,
    number: row.number,
    requesterId: row.requester_id,
    costCenterId: row.cost_center_id,
    vendorId: row.vendor_id,
    title: row.title,
    justification: row.justification,
    currency: row.currency,
    totalCents: row.total_cents,
    status: row.status,
    neededBy: row.needed_by,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    approvedAt: row.approved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    lines,
  };
}
