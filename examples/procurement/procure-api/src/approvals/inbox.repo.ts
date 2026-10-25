import type { ApprovalInboxItem } from '@northwind/contracts';
import type { Db } from '@/db/pool';

export async function listInbox(
  db: Db,
  actorId: string,
  delegatorIds: string[],
): Promise<ApprovalInboxItem[]> {
  const { rows } = await db.query(
    `SELECT s.id, s.requisition_id, s.step_order, s.approver_role, s.approver_id, s.due_at,
            r.number, r.title, r.total_cents, r.currency, u.full_name AS requester_name
       FROM approval_steps s
       JOIN requisitions r ON r.id = s.requisition_id
       JOIN users u ON u.id = r.requester_id
      WHERE s.status = 'pending' AND s.approver_id = ANY($1)
      ORDER BY s.due_at NULLS LAST`,
    [[actorId, ...delegatorIds]],
  );
  const now = Date.now();
  return rows.map((r) => ({
    stepId: r.id,
    requisitionId: r.requisition_id,
    requisitionNumber: r.number,
    title: r.title,
    requesterName: r.requester_name,
    totalCents: r.total_cents,
    currency: r.currency,
    stepOrder: r.step_order,
    approverRole: r.approver_role,
    onBehalfOf: r.approver_id === actorId ? null : r.approver_id,
    dueAt: r.due_at?.toISOString() ?? null,
    overdue: r.due_at !== null && r.due_at.getTime() < now,
  }));
}
