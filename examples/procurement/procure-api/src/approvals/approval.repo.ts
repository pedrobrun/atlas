import type { ApproverRole } from '@northwind/contracts';
import type { Db, TxClient } from '@/db/pool';
import type { PlannedStep } from './chain-builder';

export type StepStatus = 'waiting' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalStep {
  id: string;
  requisitionId: string;
  stepOrder: number;
  approverRole: ApproverRole;
  approverId: string;
  status: StepStatus;
  dueAt: Date | null;
  escalatedAt: Date | null;
}

const STEP_COLUMNS =
  'id, requisition_id, step_order, approver_role, approver_id, status, due_at, escalated_at';

function toStep(r: Record<string, any>): ApprovalStep {
  return {
    id: r.id,
    requisitionId: r.requisition_id,
    stepOrder: r.step_order,
    approverRole: r.approver_role,
    approverId: r.approver_id,
    status: r.status,
    dueAt: r.due_at,
    escalatedAt: r.escalated_at,
  };
}

export async function insertSteps(
  client: TxClient,
  requisitionId: string,
  steps: PlannedStep[],
  dueAt: Date,
) {
  const { rows } = await client.query(
    `INSERT INTO approval_steps (requisition_id, step_order, approver_role, approver_id, rule_id, status, due_at)
     SELECT $1, s.step_order, s.role, s.approver, s.rule_id,
            CASE WHEN s.step_order = 1 THEN 'pending' ELSE 'waiting' END,
            CASE WHEN s.step_order = 1 THEN $6::timestamptz END
       FROM unnest($2::int[], $3::text[], $4::uuid[], $5::uuid[]) AS s(step_order, role, approver, rule_id)
     RETURNING ${STEP_COLUMNS}`,
    [
      requisitionId,
      steps.map((s) => s.stepOrder),
      steps.map((s) => s.approverRole),
      steps.map((s) => s.approverId),
      steps.map((s) => s.ruleId),
      dueAt,
    ],
  );
  return rows.map(toStep).sort((a, b) => a.stepOrder - b.stepOrder);
}

export async function lockStep(client: TxClient, stepId: string): Promise<ApprovalStep | null> {
  const { rows } = await client.query(`SELECT ${STEP_COLUMNS} FROM approval_steps WHERE id = $1 FOR UPDATE`, [
    stepId,
  ]);
  return rows[0] ? toStep(rows[0]) : null;
}

export async function recordDecision(
  client: TxClient,
  stepId: string,
  status: 'approved' | 'rejected',
  decidedBy: string,
  comment: string | null,
) {
  await client.query(
    'UPDATE approval_steps SET status = $2, decided_by = $3, decided_at = now(), comment = $4 WHERE id = $1',
    [stepId, status, decidedBy, comment],
  );
}

export async function activateNextStep(client: TxClient, requisitionId: string, after: number, dueAt: Date) {
  const { rows } = await client.query(
    `UPDATE approval_steps SET status = 'pending', due_at = $3
      WHERE id = (SELECT id FROM approval_steps WHERE requisition_id = $1 AND step_order > $2 AND status = 'waiting'
                  ORDER BY step_order LIMIT 1)
      RETURNING ${STEP_COLUMNS}`,
    [requisitionId, after, dueAt],
  );
  return rows[0] ? toStep(rows[0]) : null;
}

export async function cancelSteps(client: TxClient, requisitionId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    "UPDATE approval_steps SET status = 'cancelled' WHERE requisition_id = $1 AND status IN ('waiting', 'pending') RETURNING id",
    [requisitionId],
  );
  return rows.map((r) => r.id);
}

export async function findOverdueSteps(db: Db, now: Date): Promise<ApprovalStep[]> {
  const { rows } = await db.query(
    `SELECT ${STEP_COLUMNS} FROM approval_steps WHERE status = 'pending' AND escalated_at IS NULL AND due_at < $1 LIMIT 200`,
    [now],
  );
  return rows.map(toStep);
}

export async function markEscalated(
  client: TxClient,
  stepId: string,
  newApproverId: string | null,
  dueAt: Date | null,
) {
  await client.query(
    `UPDATE approval_steps SET escalated_at = now(), approver_id = COALESCE($2, approver_id), due_at = COALESCE($3, due_at)
      WHERE id = $1`,
    [stepId, newApproverId, dueAt],
  );
}
