import type { ResolveExceptionInput } from '@northwind/contracts';
import { withTransaction } from '@/db/pool';
import { ConflictError, HttpError, NotFoundError } from '@/errors';
import { transitionInvoice } from '@/invoices/invoice.repo';
import { confirmBudgetConsumption } from '@/matching/match.service';
import { closeException, lockException } from './exception.repo';

// Accepting a variance only makes sense when there is a PO to measure against.
const ACCEPTABLE = new Set(['match_variance', 'low_confidence', 'totals_inconsistent']);

export async function resolveException(
  actorId: string,
  exceptionId: string,
  input: ResolveExceptionInput,
): Promise<void> {
  const accepted = await withTransaction(async (client) => {
    const exception = await lockException(client, exceptionId);
    if (!exception) throw new NotFoundError('exception', exceptionId);
    if (exception.status !== 'open') throw new ConflictError(`exception is already ${exception.status}`);

    if (input.resolution === 'reject_invoice') {
      await closeException(client, exceptionId, 'rejected', actorId, input.note);
      await transitionInvoice(
        client,
        exception.invoiceId,
        ['exception'],
        'rejected',
        `rejected by ${actorId}: ${input.note}`,
      );
      return null;
    }

    if (!ACCEPTABLE.has(exception.reason)) {
      throw new HttpError(
        422,
        `a ${exception.reason} exception cannot be accepted; fix the underlying data`,
        'not_acceptable',
      );
    }
    await closeException(client, exceptionId, 'resolved', actorId, input.note);
    await transitionInvoice(
      client,
      exception.invoiceId,
      ['exception'],
      'matched',
      `variance accepted by ${actorId}: ${input.note}`,
    );
    return exception.invoiceId;
  });

  if (accepted) await confirmBudgetConsumption(accepted);
}
