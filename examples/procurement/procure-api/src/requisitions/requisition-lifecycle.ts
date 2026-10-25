import type { RequisitionStatus } from '@northwind/contracts';
import { cancelOpenSteps, startApprovalChain } from '@/approvals/approval-chain';
import { transitionState } from '@/audit/audited-transition';
import { withTransaction } from '@/db/pool';
import { NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import { notifyApprover } from '@/notifications/notifier';
import * as repo from './requisition.repo';
import { assertOwner, mustFind } from './requisition.service';
import type { Requisition } from './requisition.types';

export async function submitRequisition(actor: Actor, id: string): Promise<Requisition> {
  const firstStepId = await withTransaction(async (client) => {
    const requisition = await repo.findRequisition(client, id);
    if (!requisition) throw new NotFoundError('requisition', id);
    assertOwner(actor, requisition);
    await transitionState<RequisitionStatus>(client, {
      entityType: 'requisition',
      entityId: id,
      from: ['draft'],
      to: 'submitted',
      action: 'submitted',
      actorId: actor.id,
      extraSet: { submitted_at: new Date() },
    });
    return startApprovalChain(client, requisition, actor);
  });
  await notifyApprover(firstStepId);
  return mustFind(id);
}

export async function withdrawRequisition(actor: Actor, id: string, reason: string): Promise<Requisition> {
  await withTransaction(async (client) => {
    const requisition = await repo.findRequisition(client, id);
    if (!requisition) throw new NotFoundError('requisition', id);
    assertOwner(actor, requisition);
    await transitionState<RequisitionStatus>(client, {
      entityType: 'requisition',
      entityId: id,
      from: ['submitted'],
      to: 'withdrawn',
      action: 'withdrawn',
      actorId: actor.id,
      payload: { reason },
    });
    await cancelOpenSteps(client, id, actor.id);
  });
  return mustFind(id);
}
