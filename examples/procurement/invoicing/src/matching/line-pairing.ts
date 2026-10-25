import type { InvoiceLine } from '@/invoices/invoice.types';

export interface PoLineRef {
  lineNo: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface LinePair {
  invoiceLine: InvoiceLine;
  poLine: PoLineRef | null;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Pairs each invoice line with a PO line: an explicit PO line number from extraction wins, then an
 * exact normalized description, then a unique PO line with the same unit price. Each PO line is
 * used at most once per invoice.
 */
export function pairLines(poLines: readonly PoLineRef[], invoiceLines: readonly InvoiceLine[]): LinePair[] {
  const unused = new Map(poLines.map((l) => [l.lineNo, l]));
  const take = (line: PoLineRef | undefined) => {
    if (!line) return null;
    unused.delete(line.lineNo);
    return line;
  };

  return invoiceLines.map((invoiceLine) => {
    if (invoiceLine.poLineNo !== null && unused.has(invoiceLine.poLineNo)) {
      return { invoiceLine, poLine: take(unused.get(invoiceLine.poLineNo)) };
    }
    const wanted = normalize(invoiceLine.description);
    const byDescription = [...unused.values()].find((l) => normalize(l.description) === wanted);
    if (byDescription) return { invoiceLine, poLine: take(byDescription) };

    const samePrice = [...unused.values()].filter((l) => l.unitPriceCents === invoiceLine.unitPriceCents);
    return { invoiceLine, poLine: samePrice.length === 1 ? take(samePrice[0]) : null };
  });
}
