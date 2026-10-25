import type { ApproverRole } from '@northwind/contracts';
import type { Db } from '@/db/pool';

export interface ApprovalRule {
  id: string;
  name: string;
  categoryCode: string | null;
  minAmountCents: number;
  maxAmountCents: number | null;
  approverRole: ApproverRole;
  stepOrder: number;
}

export interface RuleSubject {
  totalCents: number;
  spendByCategory: ReadonlyMap<string, number>;
}

export async function loadActiveRules(db: Db): Promise<ApprovalRule[]> {
  const { rows } = await db.query(
    `SELECT id, name, category_code, min_amount_cents, max_amount_cents, approver_role, step_order
       FROM approval_rules WHERE active ORDER BY step_order, id`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryCode: r.category_code,
    minAmountCents: r.min_amount_cents,
    maxAmountCents: r.max_amount_cents,
    approverRole: r.approver_role,
    stepOrder: r.step_order,
  }));
}

/**
 * Category rules are evaluated against the spend in that category, not the requisition total:
 * a $40k hardware order with one $50 software add-on should not trigger a legal-size review.
 */
export function matchRules(rules: readonly ApprovalRule[], subject: RuleSubject): ApprovalRule[] {
  const matched = rules.filter((rule) => {
    const amount =
      rule.categoryCode === null ? subject.totalCents : (subject.spendByCategory.get(rule.categoryCode) ?? 0);
    if (rule.categoryCode !== null && amount === 0) return false;
    return amount >= rule.minAmountCents && (rule.maxAmountCents === null || amount < rule.maxAmountCents);
  });

  const byRole = new Map<ApproverRole, ApprovalRule>();
  for (const rule of [...matched].sort((a, b) => a.stepOrder - b.stepOrder)) {
    if (!byRole.has(rule.approverRole)) byRole.set(rule.approverRole, rule);
  }
  return [...byRole.values()];
}
