import { formatMoney, type ApprovalInboxItem } from '@northwind/contracts';
import { procureApi } from '@/lib/procure-api';
import { requirePageSession } from '@/lib/session';
import { DecisionButtons } from './decision-buttons';

export default async function ApprovalInboxPage() {
  const session = requirePageSession('approver');
  const inbox = await procureApi<ApprovalInboxItem[]>(session, '/approvals/inbox');

  return (
    <section>
      <h1>Approval inbox</h1>
      {inbox.length === 0 && <p>Nothing waiting for you.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {inbox.map((item) => (
          <li
            key={item.stepId}
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 }}
          >
            <strong>
              {item.requisitionNumber}: {item.title}
            </strong>
            <div>
              {item.requesterName} · {formatMoney(item.totalCents, item.currency)} · step {item.stepOrder} (
              {item.approverRole.replace(/_/g, ' ')})
            </div>
            {item.onBehalfOf && <div>Delegated to you</div>}
            {item.overdue && <div style={{ color: '#d97706' }}>Past SLA</div>}
            <DecisionButtons stepId={item.stepId} />
          </li>
        ))}
      </ul>
    </section>
  );
}
