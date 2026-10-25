import type { BudgetDashboard } from '@northwind/contracts';
import { procureApi } from '@/lib/procure-api';
import { requirePageSession } from '@/lib/session';
import { RequestForm } from './request-form';

interface VendorOption {
  id: string;
  legalName: string;
}

export default async function NewRequestPage() {
  const session = requirePageSession();
  const [{ budgets }, vendors] = await Promise.all([
    procureApi<BudgetDashboard>(session, '/budgets'),
    procureApi<VendorOption[]>(session, '/vendors?status=active'),
  ]);

  return (
    <section>
      <h1>New purchase request</h1>
      <RequestForm
        costCenters={budgets.map((b) => ({
          id: b.costCenterId,
          label: `${b.costCenterCode} ${b.costCenterName}`,
          currency: b.currency,
        }))}
        vendors={vendors.map((v) => ({ id: v.id, label: v.legalName }))}
      />
    </section>
  );
}
