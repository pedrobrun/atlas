import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvariantViolation } from '@/errors';
import {
  assertCoversReceipts,
  assertNotBelowInvoiced,
  assertWithinApprovedAmount,
  poTotalCents,
} from './po-ceiling';

const lines = [
  { lineNo: 1, quantity: 10, unitPriceCents: 12_500 },
  { lineNo: 2, quantity: 1, unitPriceCents: 99_900 },
];

test('PO total is the sum of quantity times unit price in cents', () => {
  assert.equal(poTotalCents(lines), 224_900);
});

test('a PO equal to the approved amount is allowed', () => {
  assert.doesNotThrow(() => assertWithinApprovedAmount(224_900, poTotalCents(lines)));
});

test('a PO one cent over the approved requisition amount is refused', () => {
  assert.throws(
    () => assertWithinApprovedAmount(224_899, poTotalCents(lines)),
    (err: unknown) => {
      assert.ok(err instanceof InvariantViolation);
      assert.equal(err.code, 'invariant.po_within_requisition');
      return true;
    },
  );
});

test('an amendment that raises a line price past the approval is refused', () => {
  const amended = [{ ...lines[0]!, unitPriceCents: 12_600 }, lines[1]!];
  assert.throws(() => assertWithinApprovedAmount(224_900, poTotalCents(amended)), InvariantViolation);
});

test('an amendment cannot go below what was already invoiced', () => {
  assert.throws(() => assertNotBelowInvoiced(150_000, 120_000), InvariantViolation);
});

test('an amendment cannot remove quantities already received', () => {
  assert.throws(
    () => assertCoversReceipts([{ lineNo: 1, quantity: 4, unitPriceCents: 1 }], new Map([[1, 5]])),
    InvariantViolation,
  );
  assert.throws(
    () => assertCoversReceipts([{ lineNo: 1, quantity: 9, unitPriceCents: 1 }], new Map([[2, 1]])),
    InvariantViolation,
  );
});
