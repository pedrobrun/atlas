import {
  SyncablePurchaseOrdersSchema,
  SyncResultSchema,
  type CostCenterSync,
  type GlAccountSync,
  type PurchaseOrder,
  type SyncResult,
} from '@northwind/contracts';
import { callService, type ServiceTarget } from './http';

const procureApi = (): ServiceTarget => ({
  name: 'procure-api',
  baseUrl: process.env.PROCURE_API_URL,
  token: process.env.PROCURE_SERVICE_TOKEN,
});

export async function* purchaseOrdersUpdatedSince(since: Date): AsyncGenerator<PurchaseOrder> {
  let cursor: string | null = since.toISOString();
  while (cursor) {
    const page = SyncablePurchaseOrdersSchema.parse(
      await callService(
        procureApi(),
        'GET',
        `/internal/purchase-orders?updatedSince=${encodeURIComponent(cursor)}&limit=200`,
      ),
    );
    yield* page.purchaseOrders;
    cursor = page.nextCursor;
  }
}

export async function pushCostCenters(costCenters: CostCenterSync[]): Promise<SyncResult> {
  const body = { costCenters, syncedAt: new Date().toISOString() };
  return SyncResultSchema.parse(await callService(procureApi(), 'PUT', '/internal/cost-centers', body));
}

export async function pushGlAccounts(accounts: GlAccountSync[]): Promise<SyncResult> {
  const body = { accounts, syncedAt: new Date().toISOString() };
  return SyncResultSchema.parse(await callService(procureApi(), 'PUT', '/internal/gl-accounts', body));
}
