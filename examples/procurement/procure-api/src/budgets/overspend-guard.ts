import { InvariantViolation } from '@/errors';

export interface BudgetBalance {
  allocatedCents: number;
  reservedCents: number;
  consumedCents: number;
}

export function availableCents(b: BudgetBalance): number {
  return b.allocatedCents - b.reservedCents - b.consumedCents;
}

function assertPositiveCents(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new RangeError(`amount must be positive integer cents, got ${amount}`);
}

export function applyReserve(b: BudgetBalance, amountCents: number): BudgetBalance {
  assertPositiveCents(amountCents);
  const available = availableCents(b);
  if (amountCents > available) {
    throw new InvariantViolation(
      'budget_not_negative',
      `reservation of ${amountCents} exceeds available ${available}`,
      {
        availableCents: available,
        requestedCents: amountCents,
      },
    );
  }
  return { ...b, reservedCents: b.reservedCents + amountCents };
}

export function applyRelease(b: BudgetBalance, amountCents: number): BudgetBalance {
  assertPositiveCents(amountCents);
  if (amountCents > b.reservedCents) {
    throw new InvariantViolation(
      'release_within_reserved',
      `cannot release ${amountCents}; only ${b.reservedCents} reserved`,
    );
  }
  return { ...b, reservedCents: b.reservedCents - amountCents };
}

/**
 * Consumption draws first on what this requisition reserved. Anything above that (an invoice
 * within match tolerance but over the PO line) must fit in the unreserved remainder.
 */
export function applyConsume(
  b: BudgetBalance,
  amountCents: number,
  reservationRemainingCents: number,
): BudgetBalance {
  assertPositiveCents(amountCents);
  const fromReservation = Math.min(amountCents, Math.max(0, reservationRemainingCents), b.reservedCents);
  const overflow = amountCents - fromReservation;
  if (overflow > availableCents(b)) {
    throw new InvariantViolation(
      'budget_not_negative',
      `consuming ${amountCents} would overspend the budget`,
      {
        availableCents: availableCents(b),
        overflowCents: overflow,
      },
    );
  }
  return {
    ...b,
    reservedCents: b.reservedCents - fromReservation,
    consumedCents: b.consumedCents + amountCents,
  };
}
