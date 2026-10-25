import { netsuiteRequest } from '@/netsuite/client';
import { poExternalId, toNetSuitePurchaseOrder } from '@/netsuite/mappers';
import { purchaseOrdersUpdatedSince } from '@/sources/procure-api';
import { getCursor, setCursor } from '@/store/sync-ledger';
import { newReport, syncOnce, type StepReport } from './sync-once';

const CURSOR = 'procure-api.purchase_orders';

export async function pushPurchaseOrders(
  accountIdByNumber: ReadonlyMap<string, string>,
): Promise<StepReport> {
  const report = newReport('push-purchase-orders');
  const since = await getCursor(CURSOR);
  let newest = since;
  let oldestUnsettled: Date | null = null;

  for await (const po of purchaseOrdersUpdatedSince(since)) {
    const updatedAt = new Date(po.updatedAt);
    // The version is in the key so every amendment is sent once, and a replay of v2 never overwrites v3.
    const outcome = await syncOnce({
      key: `po:${po.id}:v${po.version}:${po.status}`,
      entityType: 'purchase_order',
      entityId: po.id,
      payload: po,
      send: async () => {
        const record = toNetSuitePurchaseOrder(po, accountIdByNumber);
        // PUT on an external id is NetSuite's upsert: creates v1, replaces later versions.
        await netsuiteRequest('PUT', `/services/rest/record/v1/purchaseOrder/eid:${poExternalId(po.id)}`, {
          body: record,
          idempotencyKey: `${poExternalId(po.id)}-v${po.version}`,
        });
        return poExternalId(po.id);
      },
    });

    report.counts[outcome] += 1;
    if (outcome === 'failed' || outcome === 'waiting') {
      if (!oldestUnsettled || updatedAt < oldestUnsettled) oldestUnsettled = updatedAt;
    }
    if (updatedAt > newest) newest = updatedAt;
  }

  // Never move the cursor past a record that still needs a retry; succeeded ones are skipped by the ledger.
  const next = oldestUnsettled ? new Date(oldestUnsettled.getTime() - 1) : newest;
  if (next > since) await setCursor(CURSOR, next);
  return report;
}
