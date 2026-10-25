import type { ProcurementEvent } from '@northwind/contracts';
import { pool } from '@/db/pool';
import { linkPurchaseOrder } from '@/invoices/invoice.repo';
import { rematchForPurchaseOrder } from '@/matching/match.service';
import { markCancelled, upsertPurchaseOrder } from '@/purchase-orders/po-mirror.repo';
import { insertReceipt } from '@/receipts/receipt.repo';

export async function handleProcurementEvent(event: ProcurementEvent): Promise<void> {
  switch (event.type) {
    case 'purchase_order.issued':
    case 'purchase_order.amended': {
      const po = event.payload.purchaseOrder;
      const applied = await upsertPurchaseOrder(pool, po);
      if (!applied) return;
      await linkPurchaseOrder(pool, po.number, po.id, po.vendorId, po.vendorName);
      await rematchForPurchaseOrder(po.id);
      return;
    }
    case 'purchase_order.cancelled':
      await markCancelled(pool, event.payload.purchaseOrderId);
      return;
    case 'goods.received':
      if (await insertReceipt(pool, event.payload.receipt)) {
        await rematchForPurchaseOrder(event.payload.receipt.purchaseOrderId);
      }
      return;
    case 'requisition.approved':
      // Budget accrual is procure-api's concern; nothing to mirror until a PO exists.
      return;
    default: {
      const unhandled: never = event;
      throw new Error(`unhandled event ${(unhandled as { type: string }).type}`);
    }
  }
}
