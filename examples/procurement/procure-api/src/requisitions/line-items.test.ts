import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LineItemInput } from '@northwind/contracts';
import { InvariantViolation } from '@/errors';
import { numberLines, requisitionTotalCents, spendByCategory } from './line-items';

const line = (overrides: Partial<LineItemInput> = {}): LineItemInput => ({
  description: '27" monitor',
  categoryCode: 'it-hardware',
  quantity: 2,
  unitPriceCents: 34_999,
  catalogItemId: null,
  ...overrides,
});

test('totals are computed in integer cents', () => {
  const lines = numberLines([line(), line({ quantity: 3, unitPriceCents: 1_005 })]);
  assert.equal(requisitionTotalCents(lines), 2 * 34_999 + 3 * 1_005);
});

test('lines are numbered from one in input order', () => {
  const lines = numberLines([line({ description: 'a' }), line({ description: 'b' })]);
  assert.deepEqual(
    lines.map((l) => [l.lineNo, l.description]),
    [
      [1, 'a'],
      [2, 'b'],
    ],
  );
});

test('an empty requisition is rejected', () => {
  assert.throws(() => numberLines([]), InvariantViolation);
});

test('the same catalog item cannot appear on two lines', () => {
  const id = '6f1c1c1e-6f43-4a53-9b1b-0b8a8d1b2a10';
  assert.throws(
    () => numberLines([line({ catalogItemId: id }), line({ catalogItemId: id })]),
    InvariantViolation,
  );
});

test('totals that overflow the safe integer range throw instead of losing precision', () => {
  const lines = numberLines([line({ quantity: 1_000_000, unitPriceCents: Number.MAX_SAFE_INTEGER })]);
  assert.throws(() => requisitionTotalCents(lines), RangeError);
});

test('spend is grouped by category', () => {
  const lines = numberLines([
    line(),
    line({ categoryCode: 'software', quantity: 1, unitPriceCents: 120_000 }),
  ]);
  const spend = spendByCategory(lines);
  assert.equal(spend.get('it-hardware'), 69_998);
  assert.equal(spend.get('software'), 120_000);
});
