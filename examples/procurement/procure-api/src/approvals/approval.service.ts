import type { ApprovalDecision, EventOf, RequisitionStatus } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { transitionState } from '@/audit/audited-transition';
import { reserveFunds } from '@/budgets/budget.service';
import { type TxClient, withTransaction } from '@/db/pool';
import { ConflictError, ForbiddenError, NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import { notifyApprover, notifyRequester } from '@/notifications/notifier';
import { issuePurchaseOrder } from '@/purchase-orders/po.service';
import { buildEvent, enqueueEvent } from '@/queue/outbox';
import { findRequisition } from '@/requisitions/requisition.repo';
import { cancelOpenSteps, slaDueAt } from './approval-chain';
import * as repo from './approval.repo';
import { canActFor } from './delegation';

type Next =
  | { kind: 'step'; stepId: string }
  | { kind: 'approved'; purchaseOrderId: string | null }
  | { kind: 'rejected' };
export type DecisionOutcome = { requisitionId: string; next: Next };

export async function decide(
  actor: Actor,
  stepId: string,
  decision: ApprovalDecision,
): Promise<DecisionOutcome> {
  const outcome = await withTransaction(async (client): Promise<DecisionOutcome> => {
    const step = await repo.lockStep(client, stepId);
    if (!step) throw new NotFoundError('approval step', stepId);
    if (step.status !== 'pending') throw new ConflictError(`approval step is ${step.status}`);
    if (!(await canActFor(client, actor.id, step.approverId))) {
      throw new ForbiddenError('you are not the approver or an active delegate for this step');
    }

    const status = decision.decision === 'approve' ? 'approved' : 'rejected';
    await repo.recordDecision(client, stepId, status, actor.id, decision.comment ?? null);
    await appendAuditEvent(client, {
      entityType: 'approval_step',
      entityId: stepId,
      action: decision.decision,
      fromState: 'pending',
      toState: status,
      actorId: actor.id,
      payload: {
        requisitionId: step.requisitionId,
        onBehalfOf: actor.id === step.approverId ? null : step.approverId,
        comment: decision.comment ?? null,
      },
    });

    if (status === 'rejected') {
      await cancelOpenSteps(client, step.requisitionId, actor.id);
      await transitionState<RequisitionStatus>(client, {
        entityType: 'requisition',
        entityId: step.requisitionId,
        from: ['submitted'],
        to: 'rejected',
        action: 'rejected',
        actorId: actor.id,
      });
      return { requisitionId: step.requisitionId, next: { kind: 'rejected' } };
    }

    const nextStep = await repo.activateNextStep(client, step.requisitionId, step.stepOrder, slaDueAt());
    if (nextStep) return { requisitionId: step.requisitionId, next: { kind: 'step', stepId: nextStep.id } };

    const purchaseOrderId = await finalizeApproval(client, step.requisitionId, actor);
    return { requisitionId: step.requisitionId, next: { kind: 'approved', purchaseOrderId } };
  });

  // After commit: a Slack or SendGrid outage must never roll back a decision.
  if (outcome.next.kind === 'step') await notifyApprover(outcome.next.stepId);
  else await notifyRequester(outcome.requisitionId, outcome.next.kind);
  return outcome;
}

async function finalizeApproval(
  client: TxClient,
  requisitionId: string,
  actor: Actor,
): Promise<string | null> {
  const approvedAt = new Date();
  await transitionState<RequisitionStatus>(client, {
    entityType: 'requisition',
    entityId: requisitionId,
    from: ['submitted'],
    to: 'approved',
    action: 'approved',
    actorId: actor.id,
    extraSet: { approved_at: approvedAt },
  });

  const requisition = await findRequisition(client, requisitionId);
  if (!requisition) throw new NotFoundError('requisition', requisitionId);
  await reserveFunds(client, {
    costCenterId: requisition.costCenterId,
    currency: requisition.currency,
    amountCents: requisition.totalCents,
    requisitionId,
    actorId: actor.id,
  });
  await enqueueEvent(
    client,
    buildEvent<EventOf<'requisition.approved'>>('requisition.approved', {
      requisitionId,
      costCenterId: requisition.costCenterId,
      totalCents: requisition.totalCents,
      currency: requisition.currency,
      approvedAt: approvedAt.toISOString(),
    }),
  );

  // Without a chosen vendor a buyer sources one and issues the PO from the portal later.
  if (!requisition.vendorId) return null;
  return (await issuePurchaseOrder(client, requisition, actor)).id;
}
