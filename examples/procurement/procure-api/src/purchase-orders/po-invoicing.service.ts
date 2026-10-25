import type { InvoicedAmount, PurchaseOrderStatus } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { transitionState } from '@/audit/audited-transition';
import { consumeFunds } from '@/budgets/budget.service';
import { withTransaction } from '@/db/pool';
import { ConflictError, InvariantViolation, NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import * as repo from './po.repo';

/** Called by invoicing once an invoice passes three-way match. Idempotent per invoice. */
export async function recordInvoiced(
  actor: Actor,
  poId: string,
  input: InvoicedAmount,
): Promise<{ status: 'consumed' | 'duplicate' }> {
  return withTransaction(async (client) => {
    const po = await repo.findPurchaseOrder(client, poId, { forUpdate: true });
    if (!po) throw new NotFoundError('purchase order', poId);
    if (po.currency !== input.currency)
      throw new InvariantViolation('invoice_currency', `PO is in ${po.currency}`);
    if (po.status === 'cancelled') throw new ConflictError('PO is cancelled');

    const status = await consumeFunds(client, {
      costCenterId: po.costCenterId,
      currency: po.currency,
      requisitionId: po.requisitionId,
      purchaseOrderId: poId,
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      actorId: actor.id,
    });
    if (status === 'duplicate') return { status };

    if (po.invoicedCents + input.amountCents > po.totalCents) {
      throw new InvariantViolation('invoiced_within_po', 'invoiced amount would exceed the PO total');
    }
    await repo.addInvoiced(client, poId, input.amountCents);
    await appendAuditEvent(client, {
      entityType: 'purchase_order',
      entityId: poId,
      action: 'invoice_recorded',
      actorId: actor.id,
      payload: { invoiceId: input.invoiceId, amountCents: input.amountCents },
    });
    if (po.invoicedCents + input.amountCents === po.totalCents) {
      await transitionState<PurchaseOrderStatus>(client, {
        entityType: 'purchase_order',
        entityId: poId,
        from: ['issued', 'amended'],
        to: 'closed',
        action: 'fully_invoiced',
        actorId: actor.id,
      });
    }
    return { status };
  });
}
