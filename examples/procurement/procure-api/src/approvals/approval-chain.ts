import { appendAuditEvent } from '@/audit/audit-log';
import type { TxClient } from '@/db/pool';
import type { Actor } from '@/http/auth';
import { spendByCategory } from '@/requisitions/line-items';
import type { Requisition } from '@/requisitions/requisition.types';
import * as repo from './approval.repo';
import { buildChain } from './chain-builder';
import { dbDirectory } from './directory';
import { loadActiveRules, matchRules } from './rules';

export function slaDueAt(from = new Date()): Date {
  const hours = Number(process.env.APPROVAL_SLA_HOURS ?? 48);
  return new Date(from.getTime() + hours * 3_600_000);
}

export async function startApprovalChain(
  client: TxClient,
  requisition: Requisition,
  actor: Actor,
): Promise<string> {
  const rules = matchRules(await loadActiveRules(client), {
    totalCents: requisition.totalCents,
    spendByCategory: spendByCategory(requisition.lines),
  });
  const planned = await buildChain(
    rules,
    { requesterId: requisition.requesterId, costCenterId: requisition.costCenterId },
    dbDirectory(client),
  );
  const steps = await repo.insertSteps(client, requisition.id, planned, slaDueAt());
  await appendAuditEvent(client, {
    entityType: 'requisition',
    entityId: requisition.id,
    action: 'approval_chain_started',
    actorId: actor.id,
    payload: {
      steps: planned.map((s) => ({ role: s.approverRole, approverId: s.approverId, ruleId: s.ruleId })),
    },
  });
  return steps[0]!.id;
}

export async function cancelOpenSteps(
  client: TxClient,
  requisitionId: string,
  actorId: string,
): Promise<void> {
  for (const stepId of await repo.cancelSteps(client, requisitionId)) {
    await appendAuditEvent(client, {
      entityType: 'approval_step',
      entityId: stepId,
      action: 'cancelled',
      toState: 'cancelled',
      actorId,
    });
  }
}
