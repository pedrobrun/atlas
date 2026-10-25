import { CurrencySchema, parseDecimalToCents, type CostCenterSync } from '@northwind/contracts';
import { suiteql } from '@/netsuite/suiteql';
import { pushCostCenters } from '@/sources/procure-api';
import { newReport, type StepReport } from './sync-once';

interface DepartmentRow {
  id: string;
  name: string;
  custrecord_nw_cc_code: string | null;
  isinactive: 'T' | 'F';
  currency_code: string | null;
  annual_budget: string | null;
}

export async function pullCostCenters(fiscalYear = new Date().getUTCFullYear()): Promise<StepReport> {
  const report = newReport('pull-cost-centers');
  // The annual budget lives on a custom field finance maintains on the department record.
  const rows = await suiteql<DepartmentRow>(`
    SELECT d.id, d.name, d.custrecord_nw_cc_code, d.isinactive, c.symbol AS currency_code, d.custrecord_nw_annual_budget AS annual_budget
      FROM department d LEFT JOIN currency c ON c.id = d.custrecord_nw_budget_currency
     WHERE d.custrecord_nw_cc_code IS NOT NULL`);

  const costCenters: CostCenterSync[] = [];
  for (const row of rows) {
    const currency = CurrencySchema.safeParse(row.currency_code ?? 'USD');
    if (!row.custrecord_nw_cc_code || !currency.success) {
      report.notes.push(
        `department ${row.id} skipped: missing code or unsupported currency ${row.currency_code}`,
      );
      continue;
    }
    costCenters.push({
      externalId: row.id,
      code: row.custrecord_nw_cc_code,
      name: row.name,
      active: row.isinactive === 'F',
      currency: currency.data,
      fiscalYear,
      annualBudgetCents: row.annual_budget ? parseDecimalToCents(row.annual_budget) : null,
    });
  }

  const result = await pushCostCenters(costCenters);
  report.counts.sent = result.upserted;
  report.notes.push(`${result.deactivated} deactivated`);
  if (result.clamped.length)
    report.notes.push(`allocation clamped to committed spend for ${result.clamped.join(', ')}`);
  return report;
}
