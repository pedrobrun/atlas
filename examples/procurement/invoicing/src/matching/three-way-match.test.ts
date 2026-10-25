import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InvoiceLine } from '@/invoices/invoice.types';
import { threeWayMatch, type MatchInput } from './three-way-match';
import { DEFAULT_TOLERANCE } from './tolerance';

const poLines = [
  { lineNo: 1, description: 'Ergonomic chair', quantity: 10, unitPriceCents: 42_000 },
  { lineNo: 2, description: 'Assembly service', quantity: 1, unitPriceCents: 15_000 },
];

const invoiceLine = (lineNo: number, quantity: number, unitPriceCents: number): InvoiceLine => ({
  description: poLines[lineNo - 1]!.description,
  quantity,
  unitPriceCents,
  poLineNo: lineNo,
});

function input(lines: InvoiceLine[], overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    po: { status: 'issued', currency: 'USD', totalCents: 435_000, lines: poLines },
    receivedByLine: new Map([
      [1, 10],
      [2, 1],
    ]),
    billedBefore: { quantities: new Map(), subtotalCents: 0 },
    invoice: {
      currency: 'USD',
      subtotalCents: lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0),
      lines,
    },
    tolerance: DEFAULT_TOLERANCE,
    ...overrides,
  };
}

test('an invoice that agrees with PO and receipt matches', () => {
  assert.equal(
    threeWayMatch(input([invoiceLine(1, 10, 42_000), invoiceLine(2, 1, 15_000)])).outcome,
    'matched',
  );
});

test('billing more units than were received is an exception', () => {
  const result = threeWayMatch(input([invoiceLine(1, 10, 42_000)], { receivedByLine: new Map([[1, 6]]) }));
  assert.deepEqual(result.variances, [
    { kind: 'quantity_exceeds_received', lineNo: 1, received: 6, billed: 10 },
  ]);
});

test('earlier invoices count towards received quantities', () => {
  const result = threeWayMatch(
    input([invoiceLine(1, 5, 42_000)], {
      billedBefore: { quantities: new Map([[1, 6]]), subtotalCents: 252_000 },
    }),
  );
  assert.equal(result.variances[0]?.kind, 'quantity_exceeds_received');
});

test('a price increase within 2% and the cap is tolerated', () => {
  assert.equal(threeWayMatch(input([invoiceLine(2, 1, 15_300)])).outcome, 'matched');
});

test('a price increase over the percentage tolerance is an exception', () => {
  assert.equal(threeWayMatch(input([invoiceLine(2, 1, 15_301)])).variances[0]?.kind, 'price_variance');
});

test('a small per-unit overage that adds up past the cap is an exception', () => {
  const result = threeWayMatch(input([invoiceLine(1, 10, 42_600)]));
  assert.ok(result.variances.some((v) => v.kind === 'price_variance'));
});

test('a currency mismatch short-circuits', () => {
  const lines = [invoiceLine(1, 1, 42_000)];
  const result = threeWayMatch(input(lines, { invoice: { currency: 'EUR', subtotalCents: 42_000, lines } }));
  assert.deepEqual(result.variances, [{ kind: 'currency_mismatch', expected: 'USD', actual: 'EUR' }]);
});

test('cumulative billing past the PO total is an exception', () => {
  const result = threeWayMatch(
    input([invoiceLine(2, 1, 15_000)], { billedBefore: { quantities: new Map(), subtotalCents: 430_000 } }),
  );
  assert.ok(result.variances.some((v) => v.kind === 'exceeds_po_total'));
});

test('a line that pairs with nothing on the PO is an exception', () => {
  const stray = { description: 'Expedited shipping', quantity: 1, unitPriceCents: 9_900, poLineNo: null };
  assert.ok(threeWayMatch(input([stray])).variances.some((v) => v.kind === 'unmatched_line'));
});
