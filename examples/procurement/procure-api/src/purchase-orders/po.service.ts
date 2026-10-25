import type { EventOf, PurchaseOrder, RequisitionStatus } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { transitionState } from '@/audit/audited-transition';
import { glAccountsForCategories } from '@/budgets/cost-center.repo';
import { type TxClient, withTransaction } from '@/db/pool';
import { ConflictError, InvariantViolation, NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import { buildEvent, enqueueEvent } from '@/queue/outbox';
import { categoriesOf } from '@/requisitions/line-items';
import { findRequisition, updateHeader } from '@/requisitions/requisition.repo';
import type { Requisition } from '@/requisitions/requisition.types';
import { findVendor } from '@/vendors/vendor.repo';
import { assertWithinApprovedAmount, poTotalCents } from './po-ceiling';
import * as repo from './po.repo';

export async function issuePurchaseOrder(
  client: TxClient,
  requisition: Requisition,
  actor: Actor,
): Promise<PurchaseOrder> {
  if (!requisition.vendorId) throw new InvariantViolation('po_has_vendor', 'a PO needs a vendor');
  const vendor = await findVendor(client, requisition.vendorId);
  if (vendor?.status !== 'active') throw new ConflictError(`vendor ${requisition.vendorId} is not active`);

  const gl = await glAccountsForCategories(client, categoriesOf(requisition.lines));
  const lines = requisition.lines.map((l) => ({
    lineNo: l.lineNo,
    description: l.description,
    categoryCode: l.categoryCode,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    glAccountNumber: gl.get(l.categoryCode) ?? null,
  }));
  const totalCents = poTotalCents(lines);
  assertWithinApprovedAmount(requisition.totalCents, totalCents);

  const poId = await repo.insertPurchaseOrder(client, {
    requisitionId: requisition.id,
    vendorId: requisition.vendorId,
    costCenterId: requisition.costCenterId,
    currency: requisition.currency,
    totalCents,
  });
  await repo.replaceLines(client, poId, lines);
  await transitionState<RequisitionStatus>(client, {
    entityType: 'requisition',
    entityId: requisition.id,
    from: ['approved'],
    to: 'ordered',
    action: 'ordered',
    actorId: actor.id,
    payload: { purchaseOrderId: poId },
  });
  await appendAuditEvent(client, {
    entityType: 'purchase_order',
    entityId: poId,
    action: 'issued',
    toState: 'issued',
    actorId: actor.id,
    payload: { totalCents },
  });

  const po = (await repo.findPurchaseOrder(client, poId))!;
  await enqueueEvent(
    client,
    buildEvent<EventOf<'purchase_order.issued'>>('purchase_order.issued', { purchaseOrder: po }),
  );
  return po;
}

export async function issueForRequisition(
  actor: Actor,
  requisitionId: string,
  vendorId: string,
): Promise<PurchaseOrder> {
  return withTransaction(async (client) => {
    const requisition = await findRequisition(client, requisitionId, { forUpdate: true });
    if (!requisition) throw new NotFoundError('requisition', requisitionId);
    if (requisition.status !== 'approved')
      throw new ConflictError(`requisition is ${requisition.status}, not approved`);
    if (requisition.vendorId && requisition.vendorId !== vendorId)
      throw new ConflictError('requisition was approved for a different vendor');
    if (!requisition.vendorId) await updateHeader(client, requisitionId, { vendorId });
    return issuePurchaseOrder(client, { ...requisition, vendorId }, actor);
  });
}
