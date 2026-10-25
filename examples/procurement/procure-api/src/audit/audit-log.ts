import type { Db } from '@/db/pool';

export type AuditEntity =
  | 'requisition'
  | 'approval_step'
  | 'approval_delegation'
  | 'budget'
  | 'purchase_order'
  | 'goods_receipt'
  | 'vendor'
  | 'vendor_contract'
  | 'cost_center';

export interface AuditEvent {
  entityType: AuditEntity;
  entityId: string;
  action: string;
  fromState?: string | null;
  toState?: string | null;
  actorId: string;
  payload?: Record<string, unknown>;
}

export interface AuditRecord {
  id: number;
  entityType: AuditEntity;
  entityId: string;
  action: string;
  fromState: string | null;
  toState: string | null;
  actorId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export async function appendAuditEvent(db: Db, event: AuditEvent): Promise<void> {
  if (!event.actorId) throw new Error('audit events require an actor');
  await db.query(
    `INSERT INTO audit_events (entity_type, entity_id, action, from_state, to_state, actor_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.entityType,
      event.entityId,
      event.action,
      event.fromState ?? null,
      event.toState ?? null,
      event.actorId,
      JSON.stringify(event.payload ?? {}),
    ],
  );
}

export async function listAuditEvents(
  db: Db,
  entityType: AuditEntity,
  entityId: string,
  limit = 200,
): Promise<AuditRecord[]> {
  const { rows } = await db.query(
    `SELECT id, entity_type, entity_id, action, from_state, to_state, actor_id, payload, occurred_at
       FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY id LIMIT $3`,
    [entityType, entityId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    fromState: r.from_state,
    toState: r.to_state,
    actorId: r.actor_id,
    payload: r.payload,
    occurredAt: r.occurred_at.toISOString(),
  }));
}
