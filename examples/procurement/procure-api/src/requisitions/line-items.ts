import { multiplyCents, sumCents, type LineItemInput } from '@northwind/contracts';
import { InvariantViolation } from '@/errors';
import type { RequisitionLine } from './requisition.types';

type Priced = Pick<RequisitionLine, 'quantity' | 'unitPriceCents'>;

export function numberLines(inputs: readonly LineItemInput[]): RequisitionLine[] {
  if (inputs.length === 0) {
    throw new InvariantViolation('requisition_has_lines', 'a requisition needs at least one line item');
  }
  const catalogIds = inputs.map((l) => l.catalogItemId).filter((id): id is string => id !== null);
  if (new Set(catalogIds).size !== catalogIds.length) {
    throw new InvariantViolation('catalog_item_once', 'merge duplicate catalog items into one line');
  }
  return inputs.map((line, index) => ({
    lineNo: index + 1,
    description: line.description.trim(),
    categoryCode: line.categoryCode,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    catalogItemId: line.catalogItemId,
  }));
}

export function lineTotalCents(line: Priced): number {
  return multiplyCents(line.unitPriceCents, line.quantity);
}

export function requisitionTotalCents(lines: readonly Priced[]): number {
  return sumCents(lines.map(lineTotalCents));
}

export function spendByCategory(lines: readonly RequisitionLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.categoryCode, sumCents([totals.get(line.categoryCode) ?? 0, lineTotalCents(line)]));
  }
  return totals;
}

export function categoriesOf(lines: readonly Pick<RequisitionLine, 'categoryCode'>[]): string[] {
  return [...new Set(lines.map((l) => l.categoryCode))].sort();
}
