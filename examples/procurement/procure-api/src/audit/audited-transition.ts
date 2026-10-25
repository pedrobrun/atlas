import type { TxClient } from '@/db/pool';
import { ConflictError, NotFoundError } from '@/errors';
import { appendAuditEvent } from './audit-log';

const TABLES = {
  requisition: 'requisitions',
  purchase_order: 'purchase_orders',
  vendor: 'vendors',
  vendor_contract: 'vendor_contracts',
} as const;

export type TransitionableEntity = keyof typeof TABLES;

export interface Transition<S extends string> {
  entityType: TransitionableEntity;
  entityId: string;
  from: readonly S[];
  to: S;
  action: string;
  actorId: string;
  payload?: Record<string, unknown>;
  extraSet?: Record<string, unknown>;
}

const COLUMN = /^[a-z_]+$/;

/**
 * The only sanctioned way to change the status of a stateful entity. Locks the row, checks the
 * allowed source states, updates, and writes the audit event in the caller's transaction, so a
 * status change without an audit row cannot be committed.
 */
export async function transitionState<S extends string>(client: TxClient, t: Transition<S>): Promise<S> {
  const table = TABLES[t.entityType];
  const { rows } = await client.query<{ status: S }>(`SELECT status FROM ${table} WHERE id = $1 FOR UPDATE`, [
    t.entityId,
  ]);
  const current = rows[0];
  if (!current) throw new NotFoundError(t.entityType, t.entityId);
  if (!t.from.includes(current.status)) {
    throw new ConflictError(`${t.entityType} ${t.entityId} is ${current.status}; cannot ${t.action}`, {
      from: current.status,
      to: t.to,
    });
  }

  const extra = Object.entries(t.extraSet ?? {});
  for (const [column] of extra) {
    if (!COLUMN.test(column)) throw new Error(`refusing to set column "${column}"`);
  }
  const assignments = extra.map(([column], i) => `, ${column} = $${i + 3}`).join('');
  await client.query(`UPDATE ${table} SET status = $1, updated_at = now()${assignments} WHERE id = $2`, [
    t.to,
    t.entityId,
    ...extra.map(([, value]) => value),
  ]);

  await appendAuditEvent(client, {
    entityType: t.entityType,
    entityId: t.entityId,
    action: t.action,
    fromState: current.status,
    toState: t.to,
    actorId: t.actorId,
    payload: t.payload,
  });
  return current.status;
}
