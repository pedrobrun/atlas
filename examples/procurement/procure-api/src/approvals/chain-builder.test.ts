import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApproverRole } from '@northwind/contracts';
import { InvariantViolation } from '@/errors';
import { buildChain, type ApproverDirectory } from './chain-builder';
import { matchRules, type ApprovalRule } from './rules';

const rule = (
  approverRole: ApproverRole,
  stepOrder: number,
  minAmountCents = 0,
  categoryCode: string | null = null,
): ApprovalRule => ({
  id: `rule-${approverRole}-${categoryCode ?? 'any'}`,
  name: approverRole,
  categoryCode,
  minAmountCents,
  maxAmountCents: null,
  approverRole,
  stepOrder,
});

const RULES = [
  rule('manager', 10),
  rule('cost_center_owner', 20, 500_000),
  rule('it_security', 25, 0, 'software'),
  rule('department_head', 30, 2_500_000),
];

const directory = (owner = 'owner-1'): ApproverDirectory => ({
  async resolve(role) {
    return (
      (
        {
          manager: 'manager-1',
          cost_center_owner: owner,
          it_security: 'secops-1',
          department_head: 'head-1',
        } as Record<string, string>
      )[role] ?? null
    );
  },
  async managerOf(userId) {
    return userId === 'requester-1' ? 'manager-1' : null;
  },
});

const ctx = { requesterId: 'requester-1', costCenterId: 'cc-1' };

test('a small hardware request needs only the line manager', async () => {
  const matched = matchRules(RULES, {
    totalCents: 45_000,
    spendByCategory: new Map([['it-hardware', 45_000]]),
  });
  const steps = await buildChain(matched, ctx, directory());
  assert.deepEqual(
    steps.map((s) => s.approverRole),
    ['manager'],
  );
});

test('a $30k software request is ordered by step_order across amount and category rules', async () => {
  const matched = matchRules(RULES, {
    totalCents: 3_000_000,
    spendByCategory: new Map([['software', 3_000_000]]),
  });
  const steps = await buildChain(matched, ctx, directory());
  assert.deepEqual(
    steps.map((s) => s.approverRole),
    ['manager', 'cost_center_owner', 'it_security', 'department_head'],
  );
  assert.deepEqual(
    steps.map((s) => s.stepOrder),
    [1, 2, 3, 4],
  );
});

test('category rules use category spend, not the requisition total', async () => {
  const matched = matchRules([rule('legal', 35, 1_000_000, 'professional-services')], {
    totalCents: 5_000_000,
    spendByCategory: new Map([
      ['it-hardware', 4_950_000],
      ['professional-services', 50_000],
    ]),
  });
  assert.equal(matched.length, 0);
});

test('a requester who owns the cost center is replaced by their manager, who approves once', async () => {
  const matched = matchRules(RULES, {
    totalCents: 600_000,
    spendByCategory: new Map([['it-hardware', 600_000]]),
  });
  const steps = await buildChain(matched, ctx, directory('requester-1'));
  assert.deepEqual(
    steps.map((s) => s.approverId),
    ['manager-1'],
  );
});

test('an empty rule set never auto-approves', async () => {
  await assert.rejects(buildChain([], ctx, directory()), InvariantViolation);
});
