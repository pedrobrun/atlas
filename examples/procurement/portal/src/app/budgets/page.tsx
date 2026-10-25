import { formatMoney, type BudgetDashboard } from '@northwind/contracts';
import { procureApi } from '@/lib/procure-api';
import { requirePageSession } from '@/lib/session';

export default async function BudgetDashboardPage() {
  const session = requirePageSession('finance', 'approver');
  const { fiscalYear, budgets } = await procureApi<BudgetDashboard>(session, '/budgets');

  return (
    <section>
      <h1>Budgets {fiscalYear}</h1>
      <table>
        <thead>
          <tr>
            <th>Cost center</th>
            <th>Allocated</th>
            <th>Reserved</th>
            <th>Consumed</th>
            <th>Available</th>
            <th>Committed</th>
          </tr>
        </thead>
        <tbody>
          {budgets.map((b) => {
            const pct = b.utilizationBps / 100;
            return (
              <tr key={b.costCenterId}>
                <td>
                  {b.costCenterCode} {b.costCenterName}
                </td>
                <td>{formatMoney(b.allocatedCents, b.currency)}</td>
                <td>{formatMoney(b.reservedCents, b.currency)}</td>
                <td>{formatMoney(b.consumedCents, b.currency)}</td>
                <td>{formatMoney(b.availableCents, b.currency)}</td>
                <td>
                  <div style={{ width: 160, background: '#e5e7eb', borderRadius: 4 }}>
                    <div
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        background: pct > 90 ? '#dc2626' : '#2563eb',
                        height: 8,
                        borderRadius: 4,
                      }}
                    />
                  </div>
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
