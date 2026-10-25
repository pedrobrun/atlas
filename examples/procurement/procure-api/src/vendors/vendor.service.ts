import type { BankAccountInput, KybResult, OnboardVendorInput, VendorStatus } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { transitionState } from '@/audit/audited-transition';
import { pool, withTransaction } from '@/db/pool';
import { NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import { normalizeBankAccount } from './banking';
import { assessRisk, canActivate, type RiskAssessment } from './kyb';
import * as repo from './vendor.repo';

export async function onboardVendor(actor: Actor, input: OnboardVendorInput): Promise<repo.Vendor> {
  const id = await withTransaction(async (client) => {
    const id = await repo.insertVendor(client, input);
    await appendAuditEvent(client, {
      entityType: 'vendor',
      entityId: id,
      action: 'onboarded',
      toState: 'pending_kyb',
      actorId: actor.id,
    });
    return id;
  });
  return (await repo.findVendor(pool, id))!;
}

export async function completeKyb(actor: Actor, vendorId: string, kyb: KybResult): Promise<RiskAssessment> {
  return withTransaction(async (client) => {
    const vendor = await repo.findVendor(client, vendorId);
    if (!vendor) throw new NotFoundError('vendor', vendorId);
    const risk = assessRisk(vendor.country, kyb);
    await repo.saveRisk(client, vendorId, risk);
    await transitionState<VendorStatus>(client, {
      entityType: 'vendor',
      entityId: vendorId,
      from: ['pending_kyb'],
      to: canActivate(risk) ? 'active' : 'rejected',
      action: 'kyb_completed',
      actorId: actor.id,
      payload: { score: risk.score, level: risk.level, reasons: risk.reasons },
    });
    return risk;
  });
}

export async function setVendorStatus(
  actor: Actor,
  vendorId: string,
  to: 'suspended' | 'active',
  reason: string,
) {
  await withTransaction((client) =>
    transitionState<VendorStatus>(client, {
      entityType: 'vendor',
      entityId: vendorId,
      from: to === 'suspended' ? ['active'] : ['suspended'],
      to,
      action: to === 'suspended' ? 'suspended' : 'reinstated',
      actorId: actor.id,
      payload: { reason },
    }),
  );
}

export async function addBankAccount(
  actor: Actor,
  vendorId: string,
  input: BankAccountInput,
): Promise<string> {
  const account = normalizeBankAccount(input);
  return withTransaction(async (client) => {
    const id = await repo.insertBankAccount(client, vendorId, account);
    await appendAuditEvent(client, {
      entityType: 'vendor',
      entityId: vendorId,
      action: 'bank_account_added',
      actorId: actor.id,
      payload: { kind: account.kind, maskedNumber: account.maskedNumber },
    });
    return id;
  });
}
