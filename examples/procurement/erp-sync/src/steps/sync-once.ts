import { NetSuiteError } from '@/netsuite/client';
import { MappingError } from '@/netsuite/mappers';
import { begin, payloadHash, recordFailure, recordSuccess } from '@/store/sync-ledger';

export type SyncOutcome = 'sent' | 'skipped' | 'waiting' | 'failed' | 'dead';

export interface SyncTask {
  key: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  send: () => Promise<string>;
}

export interface StepReport {
  step: string;
  counts: Record<SyncOutcome, number>;
  notes: string[];
}

export function newReport(step: string): StepReport {
  return { step, counts: { sent: 0, skipped: 0, waiting: 0, failed: 0, dead: 0 }, notes: [] };
}

function isRetryable(err: unknown): boolean {
  if (err instanceof NetSuiteError) return err.retryable;
  if (err instanceof MappingError) return false;
  return true;
}

export async function syncOnce(task: SyncTask): Promise<SyncOutcome> {
  const decision = await begin(task.key, task.entityType, task.entityId, payloadHash(task.payload));
  if (decision === 'skip') return 'skipped';
  if (decision === 'wait') return 'waiting';
  if (decision === 'dead') return 'dead';

  try {
    await recordSuccess(task.key, await task.send());
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return recordFailure(task.key, message, isRetryable(err));
  }
}
