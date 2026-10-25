import type { Currency } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { pool, type TxClient } from '@/db/pool';
import { InvariantViolation, NotFoundError } from '@/errors';
import * as repo from './budget.repo';
import { applyConsume, applyRelease, applyReserve } from './overspend-guard';

// Northwind's fiscal year is the calendar year in UTC.
export function fiscalYearOf(date = new Date()): number {
  return date.getUTCFullYear();
}

async function requireBudget(
  client: TxClient,
  costCenterId: string,
  currency: Currency,
): Promise<repo.Budget> {
  const budget = await repo.lockBudget(client, costCenterId, fiscalYearOf());
  if (!budget) throw new NotFoundError('budget', `${costCenterId}/${fiscalYearOf()}`);
  if (budget.currency !== currency) {
    throw new InvariantViolation(
      'budget_currency',
      `budget is in ${budget.currency}, spend is in ${currency}`,
    );
  }
  return budget;
}

interface ReserveInput {
  costCenterId: string;
  currency: Currency;
  amountCents: number;
  requisitionId: string;
  actorId: string;
}

export async function reserveFunds(client: TxClient, input: ReserveInput): Promise<void> {
  const budget = await requireBudget(client, input.costCenterId, input.currency);
  const next = applyReserve(budget, input.amountCents);
  await repo.saveBalance(client, budget.id, next);
  await repo.insertMovement(client, {
    budgetId: budget.id,
    kind: 'reserve',
    amountCents: input.amountCents,
    requisitionId: input.requisitionId,
  });
  await appendAuditEvent(client, {
    entityType: 'budget',
    entityId: budget.id,
    action: 'funds_reserved',
    actorId: input.actorId,
    payload: {
      requisitionId: input.requisitionId,
      amountCents: input.amountCents,
      reservedCents: next.reservedCents,
    },
  });
}

export async function releaseFunds(
  client: TxClient,
  input: ReserveInput & { purchaseOrderId: string; reason: string },
): Promise<void> {
  const budget = await requireBudget(client, input.costCenterId, input.currency);
  const next = applyRelease(budget, input.amountCents);
  await repo.saveBalance(client, budget.id, next);
  await repo.insertMovement(client, {
    budgetId: budget.id,
    kind: 'release',
    amountCents: input.amountCents,
    requisitionId: input.requisitionId,
    purchaseOrderId: input.purchaseOrderId,
  });
  await appendAuditEvent(client, {
    entityType: 'budget',
    entityId: budget.id,
    action: 'funds_released',
    actorId: input.actorId,
    payload: { purchaseOrderId: input.purchaseOrderId, amountCents: input.amountCents, reason: input.reason },
  });
}

export async function consumeFunds(
  client: TxClient,
  input: ReserveInput & { purchaseOrderId: string; invoiceId: string },
): Promise<'consumed' | 'duplicate'> {
  if (await repo.consumptionExists(client, input.invoiceId)) return 'duplicate';
  const budget = await requireBudget(client, input.costCenterId, input.currency);
  const remaining = await repo.reservationRemaining(client, input.requisitionId);
  const next = applyConsume(budget, input.amountCents, remaining);
  await repo.saveBalance(client, budget.id, next);
  await repo.insertMovement(client, {
    budgetId: budget.id,
    kind: 'consume',
    amountCents: input.amountCents,
    requisitionId: input.requisitionId,
    purchaseOrderId: input.purchaseOrderId,
    invoiceId: input.invoiceId,
  });
  await appendAuditEvent(client, {
    entityType: 'budget',
    entityId: budget.id,
    action: 'funds_consumed',
    actorId: input.actorId,
    payload: {
      invoiceId: input.invoiceId,
      purchaseOrderId: input.purchaseOrderId,
      amountCents: input.amountCents,
    },
  });
  return 'consumed';
}

export function budgetDashboard(fiscalYear = fiscalYearOf()) {
  return repo.listBudgetSummaries(pool, fiscalYear);
}
