import type { CostCenterSync, GlAccountSync, SyncResult } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import type { TxClient } from '@/db/pool';

/**
 * NetSuite is the source of truth for cost centers and allocations. An allocation lowered below
 * what is already committed is clamped to the committed amount, because the budget CHECK
 * constraint forbids negative availability; clamped codes are reported back to erp-sync.
 */
export async function upsertCostCenters(
  client: TxClient,
  costCenters: CostCenterSync[],
  actorId: string,
): Promise<SyncResult> {
  const clamped: string[] = [];
  for (const cc of costCenters) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO cost_centers (code, name, netsuite_id, active) VALUES ($1, $2, $3, $4)
       ON CONFLICT (netsuite_id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, active = EXCLUDED.active, updated_at = now()
       RETURNING id`,
      [cc.code, cc.name, cc.externalId, cc.active],
    );
    const costCenterId = rows[0]!.id;
    if (cc.annualBudgetCents === null) continue;

    const { rows: budget } = await client.query<{ allocated_cents: number }>(
      `INSERT INTO budgets (cost_center_id, fiscal_year, currency, allocated_cents) VALUES ($1, $2, $3, $4)
       ON CONFLICT (cost_center_id, fiscal_year) DO UPDATE
         SET allocated_cents = GREATEST(EXCLUDED.allocated_cents, budgets.reserved_cents + budgets.consumed_cents), updated_at = now()
       RETURNING allocated_cents`,
      [costCenterId, cc.fiscalYear, cc.currency, cc.annualBudgetCents],
    );
    if (budget[0] && budget[0].allocated_cents !== cc.annualBudgetCents) clamped.push(cc.code);
  }

  const { rowCount } = await client.query(
    'UPDATE cost_centers SET active = false, updated_at = now() WHERE active AND netsuite_id IS NOT NULL AND NOT (netsuite_id = ANY($1))',
    [costCenters.map((c) => c.externalId)],
  );
  await appendAuditEvent(client, {
    entityType: 'cost_center',
    entityId: '*',
    action: 'synced_from_erp',
    actorId,
    payload: { upserted: costCenters.length, deactivated: rowCount ?? 0, clamped },
  });
  return { upserted: costCenters.length, deactivated: rowCount ?? 0, clamped };
}

export async function upsertGlAccounts(client: TxClient, accounts: GlAccountSync[]): Promise<SyncResult> {
  await client.query(
    `INSERT INTO gl_accounts (netsuite_id, number, name, type, active)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::boolean[])
     ON CONFLICT (netsuite_id) DO UPDATE SET number = EXCLUDED.number, name = EXCLUDED.name, type = EXCLUDED.type, active = EXCLUDED.active`,
    [
      accounts.map((a) => a.externalId),
      accounts.map((a) => a.number),
      accounts.map((a) => a.name),
      accounts.map((a) => a.type),
      accounts.map((a) => a.active),
    ],
  );
  const { rowCount } = await client.query(
    'UPDATE gl_accounts SET active = false WHERE active AND NOT (netsuite_id = ANY($1))',
    [accounts.map((a) => a.externalId)],
  );
  return { upserted: accounts.length, deactivated: rowCount ?? 0, clamped: [] };
}

export async function glAccountsForCategories(
  client: TxClient,
  categories: string[],
): Promise<Map<string, string>> {
  const { rows } = await client.query<{ category_code: string; gl_account_number: string }>(
    `SELECT m.category_code, m.gl_account_number FROM category_gl_mappings m
       JOIN gl_accounts g ON g.number = m.gl_account_number AND g.active WHERE m.category_code = ANY($1)`,
    [categories],
  );
  return new Map(rows.map((r) => [r.category_code, r.gl_account_number]));
}
