import { appendAuditEvent } from '@/audit/audit-log';
import { pool, withTransaction } from '@/db/pool';
import { notifyEscalation } from '@/notifications/notifier';
import { findOverdueSteps, lockStep, markEscalated } from './approval.repo';
import { slaDueAt } from './approval-chain';
import { dbDirectory } from './directory';

const SYSTEM_ACTOR = 'system:sla-escalation';

export async function escalateOverdueApprovals(now = new Date()): Promise<number> {
  const overdue = await findOverdueSteps(pool, now);
  let escalated = 0;

  for (const candidate of overdue) {
    const result = await withTransaction(async (client) => {
      const step = await lockStep(client, candidate.id);
      if (!step || step.status !== 'pending' || step.escalatedAt) return null;

      const manager = await dbDirectory(client).managerOf(step.approverId);
      // Escalate once per step. With no manager to escalate to, mark it so finance sees it in Slack.
      await markEscalated(client, step.id, manager, manager ? slaDueAt(now) : null);
      await appendAuditEvent(client, {
        entityType: 'approval_step',
        entityId: step.id,
        action: manager ? 'escalated' : 'escalation_unassigned',
        fromState: 'pending',
        toState: 'pending',
        actorId: SYSTEM_ACTOR,
        payload: {
          previousApproverId: step.approverId,
          newApproverId: manager,
          dueAt: step.dueAt?.toISOString(),
        },
      });
      return { stepId: step.id, previousApproverId: step.approverId, reassigned: manager !== null };
    });

    if (result) {
      escalated += 1;
      await notifyEscalation(result.stepId, result.previousApproverId, result.reassigned);
    }
  }
  return escalated;
}

export function startSlaEscalationJob(intervalMs = 15 * 60_000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    escalateOverdueApprovals()
      .then((count) => count > 0 && console.info(`escalated ${count} overdue approval steps`))
      .catch((err) => console.error('approval SLA escalation failed', err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
