import type { CreateRequisitionInput, UpdateRequisitionInput } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { pool, withTransaction } from '@/db/pool';
import { ConflictError, ForbiddenError, NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import { numberLines, requisitionTotalCents } from './line-items';
import * as repo from './requisition.repo';
import type { Requisition } from './requisition.types';

export async function mustFind(id: string): Promise<Requisition> {
  const requisition = await repo.findRequisition(pool, id);
  if (!requisition) throw new NotFoundError('requisition', id);
  return requisition;
}

export function assertOwner(actor: Actor, requisition: Requisition) {
  if (requisition.requesterId !== actor.id)
    throw new ForbiddenError('only the requester can change this requisition');
}

export async function getRequisition(actor: Actor, id: string): Promise<Requisition> {
  const requisition = await mustFind(id);
  const privileged = actor.roles.some(
    (r) => r === 'approver' || r === 'finance' || r === 'buyer' || r === 'admin',
  );
  if (!privileged) assertOwner(actor, requisition);
  return requisition;
}

export function listMyRequisitions(actor: Actor): Promise<Requisition[]> {
  return repo.listByRequester(pool, actor.id);
}

export async function createRequisition(actor: Actor, input: CreateRequisitionInput): Promise<Requisition> {
  const lines = numberLines(input.lineItems);
  const totalCents = requisitionTotalCents(lines);
  const id = await withTransaction(async (client) => {
    const id = await repo.insertRequisition(client, { ...input, requesterId: actor.id, totalCents });
    await repo.replaceLines(client, id, lines);
    await appendAuditEvent(client, {
      entityType: 'requisition',
      entityId: id,
      action: 'created',
      toState: 'draft',
      actorId: actor.id,
      payload: { totalCents, lineCount: lines.length },
    });
    return id;
  });
  return mustFind(id);
}

export async function editRequisition(
  actor: Actor,
  id: string,
  patch: UpdateRequisitionInput,
): Promise<Requisition> {
  await withTransaction(async (client) => {
    const current = await repo.findRequisition(client, id, { forUpdate: true });
    if (!current) throw new NotFoundError('requisition', id);
    assertOwner(actor, current);
    if (current.status !== 'draft')
      throw new ConflictError(`requisition is ${current.status}; only drafts can be edited`);

    const lines = patch.lineItems ? numberLines(patch.lineItems) : current.lines;
    const { lineItems: _ignored, ...header } = patch;
    await repo.updateHeader(client, id, { ...header, totalCents: requisitionTotalCents(lines) });
    if (patch.lineItems) await repo.replaceLines(client, id, lines);
    await appendAuditEvent(client, {
      entityType: 'requisition',
      entityId: id,
      action: 'edited',
      fromState: 'draft',
      toState: 'draft',
      actorId: actor.id,
      payload: { changed: Object.keys(patch) },
    });
  });
  return mustFind(id);
}
