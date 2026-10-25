import { multiplyCents, sumCents } from '@northwind/contracts';
import { InvariantViolation } from '@/errors';

export interface PricedLine {
  lineNo: number;
  quantity: number;
  unitPriceCents: number;
}

export function poTotalCents(lines: readonly PricedLine[]): number {
  return sumCents(lines.map((l) => multiplyCents(l.unitPriceCents, l.quantity)));
}

export function assertWithinApprovedAmount(approvedCents: number, poTotal: number): void {
  if (poTotal > approvedCents) {
    throw new InvariantViolation(
      'po_within_requisition',
      `PO total ${poTotal} exceeds the approved requisition amount ${approvedCents}; raise a new requisition`,
      { approvedCents, poTotalCents: poTotal },
    );
  }
}

export function assertNotBelowInvoiced(invoicedCents: number, poTotal: number): void {
  if (poTotal < invoicedCents) {
    throw new InvariantViolation(
      'po_covers_invoiced',
      `PO total ${poTotal} is below the ${invoicedCents} already invoiced`,
    );
  }
}

export function assertCoversReceipts(
  lines: readonly PricedLine[],
  receivedByLine: ReadonlyMap<number, number>,
): void {
  const ordered = new Map(lines.map((l) => [l.lineNo, l.quantity]));
  for (const [lineNo, received] of receivedByLine) {
    const quantity = ordered.get(lineNo);
    if (quantity === undefined || quantity < received) {
      throw new InvariantViolation(
        'po_covers_receipts',
        `line ${lineNo} would drop below the ${received} units already received`,
      );
    }
  }
}

export function assertUniqueLineNumbers(lines: readonly PricedLine[]): void {
  if (new Set(lines.map((l) => l.lineNo)).size !== lines.length) {
    throw new InvariantViolation('po_line_numbers_unique', 'PO line numbers must be unique');
  }
}
