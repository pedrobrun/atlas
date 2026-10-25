import { ensureSchema, pool } from '@/db/pool';
import { countDeadSince } from '@/store/sync-ledger';
import { pullChartOfAccounts } from '@/steps/pull-chart-of-accounts';
import { pullCostCenters } from '@/steps/pull-cost-centers';
import { pushPaidInvoices } from '@/steps/push-paid-invoices';
import { pushPurchaseOrders } from '@/steps/push-purchase-orders';
import type { StepReport } from '@/steps/sync-once';

const RUN_LOCK = 727_200;

async function runNightlySync(): Promise<number> {
  await ensureSchema();
  const startedAt = new Date();
  const { rows: lock } = await pool.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [
    RUN_LOCK,
  ]);
  if (!lock[0]?.locked) {
    console.warn('another erp-sync run holds the lock; exiting');
    return 0;
  }
  const { rows } = await pool.query<{ id: string }>('INSERT INTO sync_runs DEFAULT VALUES RETURNING id');
  const runId = rows[0]!.id;

  // Reference data first: POs need current GL accounts and cost centers to map.
  const reports: StepReport[] = [await pullCostCenters()];
  const { report: accountsReport, accountIdByNumber } = await pullChartOfAccounts();
  reports.push(accountsReport, await pushPurchaseOrders(accountIdByNumber), await pushPaidInvoices());

  const newlyDead = await countDeadSince(startedAt);
  await pool.query('UPDATE sync_runs SET finished_at = now(), report = $2 WHERE id = $1', [
    runId,
    JSON.stringify({ reports, newlyDead }),
  ]);
  for (const r of reports) console.info(`[${r.step}]`, r.counts, r.notes.join('; '));
  if (newlyDead > 0)
    console.error(`${newlyDead} records moved to dead letter; see sync_ledger WHERE status = 'dead'`);
  return newlyDead > 0 ? 1 : 0;
}

runNightlySync()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error('erp-sync run failed', err);
    process.exitCode = 2;
  })
  .finally(() => pool.end());
