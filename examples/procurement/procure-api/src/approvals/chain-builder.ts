import type { ApproverRole } from '@northwind/contracts';
import { InvariantViolation } from '@/errors';
import type { ApprovalRule } from './rules';

export interface ChainContext {
  requesterId: string;
  costCenterId: string;
}

export interface ApproverDirectory {
  resolve(role: ApproverRole, ctx: ChainContext): Promise<string | null>;
  managerOf(userId: string): Promise<string | null>;
}

export interface PlannedStep {
  stepOrder: number;
  approverRole: ApproverRole;
  approverId: string;
  ruleId: string;
}

export async function buildChain(
  rules: readonly ApprovalRule[],
  ctx: ChainContext,
  directory: ApproverDirectory,
): Promise<PlannedStep[]> {
  if (rules.length === 0) {
    throw new InvariantViolation(
      'approval_chain_not_empty',
      'no approval rule matched; refusing to auto-approve',
    );
  }

  const steps: PlannedStep[] = [];
  const alreadyApproving = new Set<string>();
  for (const rule of rules) {
    let approverId = await directory.resolve(rule.approverRole, ctx);
    if (approverId === null) {
      throw new InvariantViolation(
        'approver_resolvable',
        `no approver configured for role ${rule.approverRole}`,
        {
          costCenterId: ctx.costCenterId,
        },
      );
    }
    // Segregation of duties: nobody approves their own spend, so the step goes one level up.
    if (approverId === ctx.requesterId) {
      approverId = await directory.managerOf(ctx.requesterId);
      if (approverId === null) {
        throw new InvariantViolation(
          'approver_resolvable',
          'requester has no manager to approve in their place',
        );
      }
    }
    if (alreadyApproving.has(approverId)) continue;
    alreadyApproving.add(approverId);
    steps.push({ stepOrder: steps.length + 1, approverRole: rule.approverRole, approverId, ruleId: rule.id });
  }
  return steps;
}
