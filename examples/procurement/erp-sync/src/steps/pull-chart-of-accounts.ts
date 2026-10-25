import type { GlAccountSync } from '@northwind/contracts';
import { suiteql } from '@/netsuite/suiteql';
import { pushGlAccounts } from '@/sources/procure-api';
import { newReport, type StepReport } from './sync-once';

interface AccountRow {
  id: string;
  acctnumber: string | null;
  fullname: string;
  accttype: string;
  isinactive: 'T' | 'F';
}

const TYPE_MAP: Record<string, GlAccountSync['type']> = {
  Expense: 'expense',
  OthExpense: 'expense',
  COGS: 'expense',
  FixedAsset: 'asset',
  OthCurrAsset: 'asset',
  OthAsset: 'asset',
  AcctPay: 'liability',
  OthCurrLiab: 'liability',
};

export async function pullChartOfAccounts(): Promise<{
  report: StepReport;
  accountIdByNumber: Map<string, string>;
}> {
  const report = newReport('pull-chart-of-accounts');
  const rows = await suiteql<AccountRow>(
    `SELECT id, acctnumber, fullname, accttype, isinactive FROM account WHERE accttype IN (${Object.keys(
      TYPE_MAP,
    )
      .map((t) => `'${t}'`)
      .join(', ')})`,
  );

  const accounts: GlAccountSync[] = rows
    .filter((r): r is AccountRow & { acctnumber: string } => Boolean(r.acctnumber))
    .map((r) => ({
      externalId: r.id,
      number: r.acctnumber,
      name: r.fullname,
      type: TYPE_MAP[r.accttype]!,
      active: r.isinactive === 'F',
    }));

  const result = await pushGlAccounts(accounts);
  report.counts.sent = result.upserted;
  report.notes.push(
    `${rows.length - accounts.length} accounts without a number ignored`,
    `${result.deactivated} deactivated`,
  );

  const accountIdByNumber = new Map(accounts.filter((a) => a.active).map((a) => [a.number, a.externalId]));
  return { report, accountIdByNumber };
}
