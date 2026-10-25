import type {
  AmendPurchaseOrderInput,
  EventOf,
  PurchaseOrder,
  PurchaseOrderStatus,
} from '@northwind/contracts';
import { transitionState } from '@/audit/audited-transition';
import { reservationRemaining } from '@/budgets/budget.repo';
import { releaseFunds, reserveFunds } from '@/budgets/budget.service';
import { withTransaction } from '@/db/pool';
import { ConflictError, NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import { buildEvent, enqueueEvent } from '@/queue/outbox';
import { findRequisition } from '@/requisitions/requisition.repo';
import { receivedQuantities } from './goods-receipt.repo';
import {
  assertCoversReceipts,
  assertNotBelowInvoiced,
  assertUniqueLineNumbers,
  assertWithinApprovedAmount,
  poTotalCents,
} from './po-ceiling';
import * as repo from './po.repo';

export async function amendPurchaseOrder(
  actor: Actor,
  poId: string,
  input: AmendPurchaseOrderInput,
): Promise<PurchaseOrder> {
  return withTransaction(async (client) => {
    const po = await repo.findPurchaseOrder(client, poId, { forUpdate: true });
    if (!po) throw new NotFoundError('purchase order', poId);
    const requisition = await findRequisition(client, po.requisitionId);
    if (!requisition) throw new NotFoundError('requisition', po.requisitionId);

    const newTotal = poTotalCents(input.lines);
    assertUniqueLineNumbers(input.lines);
    assertWithinApprovedAmount(requisition.totalCents, newTotal);
    assertNotBelowInvoiced(po.invoicedCents, newTotal);
    assertCoversReceipts(input.lines, await receivedQuantities(client, poId));

    const budgetRef = {
      costCenterId: po.costCenterId,
      currency: po.currency,
      requisitionId: po.requisitionId,
      actorId: actor.id,
    };
    const delta = po.totalCents - newTotal;
    if (delta > 0)
      await releaseFunds(client, {
        ...budgetRef,
        amountCents: delta,
        purchaseOrderId: poId,
        reason: input.reason,
      });
    if (delta < 0) await reserveFunds(client, { ...budgetRef, amountCents: -delta });

    await repo.replaceLines(client, poId, input.lines);
    await repo.setTotalAndBumpVersion(client, poId, newTotal);
    await transitionState<PurchaseOrderStatus>(client, {
      entityType: 'purchase_order',
      entityId: poId,
      from: ['issued', 'amended'],
      to: 'amended',
      action: 'amended',
      actorId: actor.id,
      payload: { previousTotalCents: po.totalCents, newTotalCents: newTotal, reason: input.reason },
    });

    const amended = (await repo.findPurchaseOrder(client, poId))!;
    await enqueueEvent(
      client,
      buildEvent<EventOf<'purchase_order.amended'>>('purchase_order.amended', {
        purchaseOrder: amended,
        previousTotalCents: po.totalCents,
      }),
    );
    return amended;
  });
}

export async function cancelPurchaseOrder(actor: Actor, poId: string, reason: string): Promise<void> {
  await withTransaction(async (client) => {
    const po = await repo.findPurchaseOrder(client, poId, { forUpdate: true });
    if (!po) throw new NotFoundError('purchase order', poId);
    if (po.invoicedCents > 0)
      throw new ConflictError('PO already has matched invoices; close it instead of cancelling');

    const remaining = await reservationRemaining(client, po.requisitionId);
    if (remaining > 0) {
      await releaseFunds(client, {
        costCenterId: po.costCenterId,
        currency: po.currency,
        requisitionId: po.requisitionId,
        purchaseOrderId: poId,
        amountCents: remaining,
        actorId: actor.id,
        reason,
      });
    }
    await transitionState<PurchaseOrderStatus>(client, {
      entityType: 'purchase_order',
      entityId: poId,
      from: ['issued', 'amended'],
      to: 'cancelled',
      action: 'cancelled',
      actorId: actor.id,
      payload: { reason, releasedCents: remaining },
    });
    await enqueueEvent(
      client,
      buildEvent<EventOf<'purchase_order.cancelled'>>('purchase_order.cancelled', {
        purchaseOrderId: poId,
        reason,
        cancelledAt: new Date().toISOString(),
      }),
    );
  });
}
