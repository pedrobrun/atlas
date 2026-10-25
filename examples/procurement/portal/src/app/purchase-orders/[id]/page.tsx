import { notFound } from 'next/navigation';
import { formatMoney, multiplyCents, type PurchaseOrder } from '@northwind/contracts';
import { StatusBadge } from '@/components/status-badge';
import { ApiError, procureApi } from '@/lib/procure-api';
import { requirePageSession } from '@/lib/session';

export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const session = requirePageSession();
  let po: PurchaseOrder;
  try {
    po = await procureApi<PurchaseOrder>(session, `/purchase-orders/${params.id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const money = (cents: number) => formatMoney(cents, po.currency);

  return (
    <section>
      <h1>
        {po.number} <StatusBadge status={po.status} />
      </h1>
      <p>
        {po.vendorName} · cost center {po.costCenterCode} · version {po.version} · issued{' '}
        {new Date(po.issuedAt).toLocaleDateString()}
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Total</th>
            <th>GL</th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((l) => (
            <tr key={l.lineNo}>
              <td>{l.lineNo}</td>
              <td>{l.description}</td>
              <td>{l.quantity}</td>
              <td>{money(l.unitPriceCents)}</td>
              <td>{money(multiplyCents(l.unitPriceCents, l.quantity))}</td>
              <td>{l.glAccountNumber ?? 'unmapped'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl>
        <dt>PO total</dt>
        <dd>{money(po.totalCents)}</dd>
        <dt>Invoiced so far</dt>
        <dd>{money(po.invoicedCents)}</dd>
        <dt>Remaining</dt>
        <dd>{money(po.totalCents - po.invoicedCents)}</dd>
      </dl>
    </section>
  );
}
