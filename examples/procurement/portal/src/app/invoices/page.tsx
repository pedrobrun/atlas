import { formatMoney, type InvoiceSummary } from '@northwind/contracts';
import { StatusBadge } from '@/components/status-badge';
import { invoicingApi } from '@/lib/invoicing-api';
import { requirePageSession } from '@/lib/session';
import { ExceptionActions } from './exception-actions';

export default async function InvoicesAwaitingMatchPage() {
  const session = requirePageSession('finance');
  const { invoices } = await invoicingApi<{ invoices: InvoiceSummary[] }>(
    session,
    '/invoices/awaiting-match',
  );

  return (
    <section>
      <h1>Invoices awaiting match</h1>
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Vendor</th>
            <th>PO</th>
            <th>Amount</th>
            <th>Due</th>
            <th>Status</th>
            <th>Exception</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.invoiceNumber ?? 'unreadable'}</td>
              <td>{inv.vendorName ?? 'unknown'}</td>
              <td>{inv.purchaseOrderNumber ?? 'none'}</td>
              <td>
                {inv.totalCents !== null && inv.currency ? formatMoney(inv.totalCents, inv.currency) : '?'}
              </td>
              <td>{inv.dueDate ?? ''}</td>
              <td>
                <StatusBadge status={inv.status} />
              </td>
              <td>
                {inv.openException && (
                  <>
                    <div>{inv.openException.reason.replace(/_/g, ' ')}</div>
                    <ExceptionActions exceptionId={inv.openException.id} />
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
