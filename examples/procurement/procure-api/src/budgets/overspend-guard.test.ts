import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvariantViolation } from '@/errors';
import {
  applyConsume,
  applyRelease,
  applyReserve,
  availableCents,
  type BudgetBalance,
} from './overspend-guard';

const fresh = (allocatedCents = 1_000_000): BudgetBalance => ({
  allocatedCents,
  reservedCents: 0,
  consumedCents: 0,
});

test('a reservation larger than the available budget is refused', () => {
  const b = applyReserve(fresh(), 900_000);
  assert.throws(() => applyReserve(b, 100_001), InvariantViolation);
  assert.equal(availableCents(applyReserve(b, 100_000)), 0);
});

test('releasing more than is reserved is refused', () => {
  assert.throws(() => applyRelease(applyReserve(fresh(), 5_000), 5_001), InvariantViolation);
});

test('consumption moves money from reserved to consumed', () => {
  const b = applyConsume(applyReserve(fresh(), 400_000), 250_000, 400_000);
  assert.deepEqual(b, { allocatedCents: 1_000_000, reservedCents: 150_000, consumedCents: 250_000 });
});

test('consumption above the reservation needs unreserved funds', () => {
  const nearlyFull = applyReserve(fresh(100_000), 100_000);
  assert.throws(() => applyConsume(nearlyFull, 100_500, 100_000), InvariantViolation);
});

test('non-integer and non-positive amounts are rejected', () => {
  assert.throws(() => applyReserve(fresh(), 10.5), RangeError);
  assert.throws(() => applyReserve(fresh(), 0), RangeError);
});

test('no sequence of guarded operations drives a budget negative', () => {
  let seed = 42;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  let b = fresh(5_000_000);
  let reservation = 0;
  for (let i = 0; i < 5_000; i++) {
    const amount = 1 + Math.floor(random() * 400_000);
    try {
      const op = random();
      if (op < 0.4) {
        b = applyReserve(b, amount);
        reservation += amount;
      } else if (op < 0.7) {
        b = applyRelease(b, amount);
        reservation -= amount;
      } else {
        const before = b.reservedCents;
        b = applyConsume(b, amount, reservation);
        reservation -= before - b.reservedCents;
      }
    } catch (err) {
      if (!(err instanceof InvariantViolation)) throw err;
    }
    assert.ok(availableCents(b) >= 0, `budget went negative at step ${i}`);
    assert.ok(b.reservedCents >= 0 && b.consumedCents >= 0);
  }
});
