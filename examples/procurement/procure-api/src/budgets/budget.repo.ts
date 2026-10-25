import type { BudgetSummary, Currency } from '@northwind/contracts';
import type { Db, TxClient } from '@/db/pool';
import { availableCents, type BudgetBalance } from './overspend-guard';

export interface Budget extends BudgetBalance {
  id: string;
  costCenterId: string;
  fiscalYear: number;
  currency: Currency;
}

export type MovementKind = 'reserve' | 'release' | 'consume';

export interface Movement {
  budgetId: string;
  kind: MovementKind;
  amountCents: number;
  requisitionId: string;
  purchaseOrderId?: string | null;
  invoiceId?: string | null;
}

export async function lockBudget(
  client: TxClient,
  costCenterId: string,
  fiscalYear: number,
): Promise<Budget | null> {
  const { rows } = await client.query(
    `SELECT id, cost_center_id, fiscal_year, currency, allocated_cents, reserved_cents, consumed_cents
       FROM budgets WHERE cost_center_id = $1 AND fiscal_year = $2 FOR UPDATE`,
    [costCenterId, fiscalYear],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    costCenterId: r.cost_center_id,
    fiscalYear: r.fiscal_year,
    currency: r.currency,
    allocatedCents: r.allocated_cents,
    reservedCents: r.reserved_cents,
    consumedCents: r.consumed_cents,
  };
}

export async function saveBalance(client: TxClient, budgetId: string, b: BudgetBalance) {
  await client.query(
    'UPDATE budgets SET reserved_cents = $2, consumed_cents = $3, updated_at = now() WHERE id = $1',
    [budgetId, b.reservedCents, b.consumedCents],
  );
}

export async function insertMovement(client: TxClient, m: Movement) {
  await client.query(
    `INSERT INTO budget_movements (budget_id, kind, amount_cents, requisition_id, purchase_order_id, invoice_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [m.budgetId, m.kind, m.amountCents, m.requisitionId, m.purchaseOrderId ?? null, m.invoiceId ?? null],
  );
}

export async function reservationRemaining(client: TxClient, requisitionId: string): Promise<number> {
  const { rows } = await client.query<{ remaining: number }>(
    `SELECT COALESCE(SUM(CASE kind WHEN 'reserve' THEN amount_cents ELSE -amount_cents END), 0)::bigint AS remaining
       FROM budget_movements WHERE requisition_id = $1`,
    [requisitionId],
  );
  return rows[0]?.remaining ?? 0;
}

export async function consumptionExists(client: TxClient, invoiceId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    "SELECT 1 FROM budget_movements WHERE invoice_id = $1 AND kind = 'consume'",
    [invoiceId],
  );
  return (rowCount ?? 0) > 0;
}

export async function listBudgetSummaries(db: Db, fiscalYear: number): Promise<BudgetSummary[]> {
  const { rows } = await db.query(
    `SELECT b.cost_center_id, c.code, c.name, b.fiscal_year, b.currency, b.allocated_cents, b.reserved_cents, b.consumed_cents
       FROM budgets b JOIN cost_centers c ON c.id = b.cost_center_id
      WHERE b.fiscal_year = $1 AND c.active ORDER BY c.code`,
    [fiscalYear],
  );
  return rows.map((r) => {
    const balance = {
      allocatedCents: r.allocated_cents,
      reservedCents: r.reserved_cents,
      consumedCents: r.consumed_cents,
    };
    const committed = balance.reservedCents + balance.consumedCents;
    return {
      costCenterId: r.cost_center_id,
      costCenterCode: r.code,
      costCenterName: r.name,
      fiscalYear: r.fiscal_year,
      currency: r.currency,
      ...balance,
      availableCents: availableCents(balance),
      utilizationBps:
        balance.allocatedCents === 0 ? 0 : Math.floor((committed * 10_000) / balance.allocatedCents),
    };
  });
}
