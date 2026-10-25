import Link from 'next/link';
import { formatMoney, type Requisition } from '@northwind/contracts';
import { StatusBadge } from '@/components/status-badge';
import { procureApi } from '@/lib/procure-api';
import { requirePageSession } from '@/lib/session';

export default async function MyRequestsPage({ searchParams }: { searchParams: { highlight?: string } }) {
  const session = requirePageSession();
  const requisitions = await procureApi<Requisition[]>(session, '/requisitions/mine');

  return (
    <section>
      <h1>My purchase requests</h1>
      <Link href="/requests/new">New request</Link>
      {requisitions.length === 0 ? (
        <p>You have not raised any requests yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Title</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {requisitions.map((r) => (
              <tr key={r.id} style={r.id === searchParams.highlight ? { background: '#fef9c3' } : undefined}>
                <td>{r.number}</td>
                <td>{r.title}</td>
                <td>{formatMoney(r.totalCents, r.currency)}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
