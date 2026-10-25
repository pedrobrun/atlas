import type { Currency, PayoutAccount } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { pool, withTransaction } from '@/db/pool';
import { ConflictError, NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import * as repo from './vendor.repo';

// Vendors are paid through Stripe Connect; invoicing reads this at payment time, never caches it.
export async function setPayoutAccount(
  actor: Actor,
  vendorId: string,
  stripeAccountId: string,
  currency: Currency,
) {
  await withTransaction(async (client) => {
    await repo.setPayoutAccount(client, vendorId, stripeAccountId, currency);
    await appendAuditEvent(client, {
      entityType: 'vendor',
      entityId: vendorId,
      action: 'payout_account_set',
      actorId: actor.id,
      payload: { stripeAccountId, currency },
    });
  });
}

export async function getPayoutAccount(vendorId: string): Promise<PayoutAccount> {
  const vendor = await repo.findVendor(pool, vendorId);
  if (!vendor) throw new NotFoundError('vendor', vendorId);
  if (!vendor.stripeAccountId || !vendor.payoutCurrency)
    throw new ConflictError('vendor has no payout account');
  return {
    vendorId,
    vendorStatus: vendor.status,
    stripeAccountId: vendor.stripeAccountId,
    payoutCurrency: vendor.payoutCurrency,
  };
}
