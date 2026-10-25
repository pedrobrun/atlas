import { multiplyCents, sumCents, type Currency } from '@northwind/contracts';
import type { InvoiceLine } from '@/invoices/invoice.types';
import { pairLines, type LinePair, type PoLineRef } from './line-pairing';
import { priceWithinTolerance, type ToleranceRules } from './tolerance';

export type Variance =
  | { kind: 'currency_mismatch'; expected: Currency; actual: Currency }
  | { kind: 'po_not_open'; status: string }
  | { kind: 'unmatched_line'; description: string }
  | { kind: 'quantity_exceeds_received'; lineNo: number; received: number; billed: number }
  | { kind: 'price_variance'; lineNo: number; poUnitCents: number; invoiceUnitCents: number }
  | { kind: 'subtotal_mismatch'; linesCents: number; subtotalCents: number }
  | { kind: 'exceeds_po_total'; poTotalCents: number; billedCents: number };

export interface MatchInput {
  po: { status: string; currency: Currency; totalCents: number; lines: readonly PoLineRef[] };
  receivedByLine: ReadonlyMap<number, number>;
  billedBefore: { quantities: ReadonlyMap<number, number>; subtotalCents: number };
  invoice: { currency: Currency; subtotalCents: number; lines: readonly InvoiceLine[] };
  tolerance: ToleranceRules;
}

export interface MatchResult {
  outcome: 'matched' | 'exception';
  variances: Variance[];
  pairs: LinePair[];
}

export function threeWayMatch(input: MatchInput): MatchResult {
  const { po, invoice, tolerance } = input;
  if (invoice.currency !== po.currency) {
    return {
      outcome: 'exception',
      variances: [{ kind: 'currency_mismatch', expected: po.currency, actual: invoice.currency }],
      pairs: [],
    };
  }

  const variances: Variance[] = [];
  if (po.status === 'cancelled') variances.push({ kind: 'po_not_open', status: po.status });

  const pairs = pairLines(po.lines, invoice.lines);
  for (const { invoiceLine, poLine } of pairs) {
    if (!poLine) {
      variances.push({ kind: 'unmatched_line', description: invoiceLine.description });
      continue;
    }
    const received = input.receivedByLine.get(poLine.lineNo) ?? 0;
    const billed = (input.billedBefore.quantities.get(poLine.lineNo) ?? 0) + invoiceLine.quantity;
    if (billed > received + tolerance.quantityOverReceipt) {
      variances.push({ kind: 'quantity_exceeds_received', lineNo: poLine.lineNo, received, billed });
    }
    if (
      !priceWithinTolerance(
        poLine.unitPriceCents,
        invoiceLine.unitPriceCents,
        invoiceLine.quantity,
        tolerance,
      )
    ) {
      variances.push({
        kind: 'price_variance',
        lineNo: poLine.lineNo,
        poUnitCents: poLine.unitPriceCents,
        invoiceUnitCents: invoiceLine.unitPriceCents,
      });
    }
  }

  const linesCents = sumCents(invoice.lines.map((l) => multiplyCents(l.unitPriceCents, l.quantity)));
  if (Math.abs(linesCents - invoice.subtotalCents) > tolerance.subtotalRoundingCents) {
    variances.push({ kind: 'subtotal_mismatch', linesCents, subtotalCents: invoice.subtotalCents });
  }

  // Tax is excluded: POs are issued pre-tax, so the cap applies to subtotals only.
  const billedCents = input.billedBefore.subtotalCents + invoice.subtotalCents;
  if (billedCents > po.totalCents)
    variances.push({ kind: 'exceeds_po_total', poTotalCents: po.totalCents, billedCents });

  return { outcome: variances.length === 0 ? 'matched' : 'exception', variances, pairs };
}
