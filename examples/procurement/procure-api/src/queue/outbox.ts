import { randomUUID } from 'node:crypto';
import { messageGroupId, ProcurementEventSchema, type ProcurementEvent } from '@northwind/contracts';
import type { TxClient } from '@/db/pool';

export function buildEvent<E extends ProcurementEvent>(type: E['type'], payload: E['payload']): E {
  return {
    eventId: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    schemaVersion: 1,
    payload,
  } as E;
}

/**
 * Events are written in the same transaction as the state change that caused them and relayed
 * to SQS afterwards (outbox-relay.job.ts), so an event is published if and only if the change commits.
 */
export async function enqueueEvent(client: TxClient, event: ProcurementEvent): Promise<void> {
  const parsed = ProcurementEventSchema.parse(event);
  await client.query('INSERT INTO outbox (event_id, event_type, group_id, body) VALUES ($1, $2, $3, $4)', [
    parsed.eventId,
    parsed.type,
    messageGroupId(parsed),
    JSON.stringify(parsed),
  ]);
}
