import type { CreateDelegationInput } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { type Db, withTransaction } from '@/db/pool';
import { ConflictError, InvariantViolation } from '@/errors';
import type { Actor } from '@/http/auth';

const MAX_DELEGATION_DAYS = 60;

export async function activeDelegatorsFor(db: Db, delegateId: string, at = new Date()): Promise<string[]> {
  const { rows } = await db.query<{ delegator_id: string }>(
    'SELECT delegator_id FROM approval_delegations WHERE delegate_id = $1 AND starts_at <= $2 AND ends_at > $2',
    [delegateId, at],
  );
  return rows.map((r) => r.delegator_id);
}

export async function canActFor(
  db: Db,
  actorId: string,
  approverId: string,
  at = new Date(),
): Promise<boolean> {
  if (actorId === approverId) return true;
  return (await activeDelegatorsFor(db, actorId, at)).includes(approverId);
}

export async function createDelegation(actor: Actor, input: CreateDelegationInput): Promise<string> {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (input.delegateId === actor.id)
    throw new InvariantViolation('delegation_to_other', 'you cannot delegate to yourself');
  if (endsAt.getTime() - startsAt.getTime() > MAX_DELEGATION_DAYS * 86_400_000) {
    throw new InvariantViolation(
      'delegation_length',
      `delegations are limited to ${MAX_DELEGATION_DAYS} days`,
    );
  }

  return withTransaction(async (client) => {
    // Chains (A to B while B delegates to C) make it unclear who decided; refuse overlaps instead.
    const { rows: chained } = await client.query(
      `SELECT 1 FROM approval_delegations
        WHERE (delegator_id = $1 OR delegate_id = $2) AND starts_at < $4 AND ends_at > $3 LIMIT 1`,
      [input.delegateId, actor.id, startsAt, endsAt],
    );
    if (chained.length > 0) throw new ConflictError('overlapping delegation would create a delegation chain');

    const { rows } = await client.query<{ id: string }>(
      'INSERT INTO approval_delegations (delegator_id, delegate_id, starts_at, ends_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [actor.id, input.delegateId, startsAt, endsAt],
    );
    const id = rows[0]!.id;
    await appendAuditEvent(client, {
      entityType: 'approval_delegation',
      entityId: id,
      action: 'created',
      actorId: actor.id,
      payload: { delegateId: input.delegateId, startsAt: input.startsAt, endsAt: input.endsAt },
    });
    return id;
  });
}
