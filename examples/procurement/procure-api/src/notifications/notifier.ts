import { formatMoney, type Currency } from '@northwind/contracts';
import { pool } from '@/db/pool';
import { approvalLink } from './approval-link';
import { sendApprovalEmail, sendStatusEmail } from './email';
import { postEscalation, sendApprovalDm, sendDirectMessage } from './slack';

const portalUrl = (path: string) => `${process.env.PORTAL_BASE_URL ?? ''}${path}`;

async function deliver(label: string, sends: Promise<unknown>[]): Promise<void> {
  // Notifications are best effort; a failed channel is logged and never surfaces to the caller.
  for (const result of await Promise.allSettled(sends)) {
    if (result.status === 'rejected') console.error(`notification "${label}" failed`, result.reason);
  }
}

export async function notifyApprover(stepId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT s.approver_id, s.due_at, a.email, a.slack_user_id, r.id AS requisition_id, r.number, r.title,
            r.total_cents, r.currency, q.full_name AS requester_name
       FROM approval_steps s
       JOIN users a ON a.id = s.approver_id
       JOIN requisitions r ON r.id = s.requisition_id
       JOIN users q ON q.id = r.requester_id
      WHERE s.id = $1`,
    [stepId],
  );
  const row = rows[0];
  if (!row) return;
  const amountLabel = formatMoney(row.total_cents, row.currency as Currency);
  const link = portalUrl(`/approvals?step=${stepId}`);
  const sends: Promise<unknown>[] = [
    sendApprovalEmail({
      to: row.email,
      requisitionNumber: row.number,
      title: row.title,
      requesterName: row.requester_name,
      amountLabel,
      approveUrl: approvalLink(stepId, row.approver_id, 'approve'),
      rejectUrl: approvalLink(stepId, row.approver_id, 'reject'),
      portalUrl: link,
    }),
  ];
  if (row.slack_user_id) {
    sends.push(
      sendApprovalDm({
        slackUserId: row.slack_user_id,
        requisitionNumber: row.number,
        title: row.title,
        requesterName: row.requester_name,
        amountLabel,
        dueLabel: row.due_at ? row.due_at.toUTCString() : 'no deadline',
        portalUrl: link,
      }),
    );
  }
  await deliver('approval request', sends);
}

export async function notifyRequester(
  requisitionId: string,
  outcome: 'approved' | 'rejected',
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT r.number, r.title, u.email, u.slack_user_id FROM requisitions r JOIN users u ON u.id = r.requester_id WHERE r.id = $1`,
    [requisitionId],
  );
  const row = rows[0];
  if (!row) return;
  const text = `${row.number} "${row.title}" was ${outcome}. ${portalUrl(`/requests?highlight=${requisitionId}`)}`;
  const sends: Promise<unknown>[] = [sendStatusEmail(row.email, `${row.number} ${outcome}`, text)];
  if (row.slack_user_id) sends.push(sendDirectMessage(row.slack_user_id, text));
  await deliver(`requisition ${outcome}`, sends);
}

export async function notifyEscalation(
  stepId: string,
  previousApproverId: string,
  reassigned: boolean,
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT r.number, p.full_name AS previous_name, n.full_name AS new_name
       FROM approval_steps s JOIN requisitions r ON r.id = s.requisition_id
       JOIN users p ON p.id = $2 JOIN users n ON n.id = s.approver_id
      WHERE s.id = $1`,
    [stepId, previousApproverId],
  );
  const row = rows[0];
  if (!row) return;
  const text = reassigned
    ? `:alarm_clock: ${row.number} sat with ${row.previous_name} past its SLA and moved to ${row.new_name}.`
    : `:rotating_light: ${row.number} is overdue with ${row.previous_name} and has no manager to escalate to.`;
  await deliver('sla escalation', [postEscalation(text), ...(reassigned ? [notifyApprover(stepId)] : [])]);
}
