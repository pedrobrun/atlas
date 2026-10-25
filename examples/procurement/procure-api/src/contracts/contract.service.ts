import { appendAuditEvent } from '@/audit/audit-log';
import { transitionState } from '@/audit/audited-transition';
import { pool, withTransaction } from '@/db/pool';
import { ConflictError, NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import { findVendor } from '@/vendors/vendor.repo';
import { sendForSignature } from './docusign-client';

type ContractStatus = 'draft' | 'sent' | 'signed' | 'declined' | 'voided';

export interface CreateContractInput {
  vendorId: string;
  title: string;
  documentBase64: string;
  signerEmail: string;
  signerName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export async function createVendorContract(
  actor: Actor,
  input: CreateContractInput,
): Promise<{ id: string; envelopeId: string }> {
  const vendor = await findVendor(pool, input.vendorId);
  if (!vendor) throw new NotFoundError('vendor', input.vendorId);
  if (vendor.status !== 'active') throw new ConflictError('contracts can only be sent to active vendors');

  const contractId = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO vendor_contracts (vendor_id, title, signer_email, signer_name, effective_from, effective_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        input.vendorId,
        input.title,
        input.signerEmail,
        input.signerName,
        input.effectiveFrom,
        input.effectiveTo,
        actor.id,
      ],
    );
    const id = rows[0]!.id;
    await appendAuditEvent(client, {
      entityType: 'vendor_contract',
      entityId: id,
      action: 'drafted',
      toState: 'draft',
      actorId: actor.id,
    });
    return id;
  });

  // The DocuSign call sits outside the transaction; if it fails the contract stays a visible draft.
  const envelopeId = await sendForSignature({
    contractId,
    documentBase64: input.documentBase64,
    documentName: `${input.title}.pdf`,
    signerEmail: input.signerEmail,
    signerName: input.signerName,
    emailSubject: `Northwind Supply: please sign "${input.title}"`,
  });

  await withTransaction((client) =>
    transitionState<ContractStatus>(client, {
      entityType: 'vendor_contract',
      entityId: contractId,
      from: ['draft'],
      to: 'sent',
      action: 'sent_for_signature',
      actorId: actor.id,
      extraSet: { docusign_envelope_id: envelopeId },
    }),
  );
  return { id: contractId, envelopeId };
}

const ENVELOPE_STATUS: Record<string, ContractStatus | undefined> = {
  completed: 'signed',
  declined: 'declined',
  voided: 'voided',
};

export async function applyEnvelopeStatus(
  envelopeId: string,
  envelopeStatus: string,
): Promise<'applied' | 'ignored'> {
  const target = ENVELOPE_STATUS[envelopeStatus];
  if (!target) return 'ignored';

  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; status: ContractStatus }>(
      'SELECT id, status FROM vendor_contracts WHERE docusign_envelope_id = $1',
      [envelopeId],
    );
    const contract = rows[0];
    // DocuSign Connect retries deliveries, so a repeat of the current status is a no-op.
    if (!contract || contract.status === target) return 'ignored';
    await transitionState<ContractStatus>(client, {
      entityType: 'vendor_contract',
      entityId: contract.id,
      from: ['sent'],
      to: target,
      action: `envelope_${envelopeStatus}`,
      actorId: 'system:docusign',
      payload: { envelopeId },
    });
    return 'applied';
  });
}
