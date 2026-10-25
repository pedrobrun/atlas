import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TxClient } from '@/db/pool';
import { ConflictError, NotFoundError } from '@/errors';
import { transitionState } from './audited-transition';

function fakeClient(currentStatus: string | null, opts: { failAudit?: boolean } = {}) {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const verb = sql.trim().split(/\s+/).slice(0, 3).join(' ');
      statements.push(verb);
      if (sql.startsWith('SELECT status')) return { rows: currentStatus ? [{ status: currentStatus }] : [] };
      if (sql.includes('INSERT INTO audit_events') && opts.failAudit) throw new Error('audit insert failed');
      return { rows: [], rowCount: 1 };
    },
  };
  return { client: client as unknown as TxClient, statements };
}

const base = {
  entityType: 'requisition',
  entityId: 'req-1',
  action: 'submitted',
  actorId: 'user-1',
} as const;

test('a successful transition updates the row and then writes exactly one audit event', async () => {
  const { client, statements } = fakeClient('draft');
  const previous = await transitionState(client, { ...base, from: ['draft'], to: 'submitted' });

  assert.equal(previous, 'draft');
  assert.deepEqual(statements, ['SELECT status FROM', 'UPDATE requisitions SET', 'INSERT INTO audit_events']);
});

test('a transition from a disallowed state writes neither an update nor an audit event', async () => {
  const { client, statements } = fakeClient('approved');
  await assert.rejects(transitionState(client, { ...base, from: ['draft'], to: 'submitted' }), ConflictError);
  assert.deepEqual(statements, ['SELECT status FROM']);
});

test('a missing entity is reported as not found', async () => {
  const { client } = fakeClient(null);
  await assert.rejects(transitionState(client, { ...base, from: ['draft'], to: 'submitted' }), NotFoundError);
});

test("an audit failure propagates so the caller's transaction rolls back the status change", async () => {
  const { client } = fakeClient('draft', { failAudit: true });
  await assert.rejects(
    transitionState(client, { ...base, from: ['draft'], to: 'submitted' }),
    /audit insert failed/,
  );
});

test('extra columns are restricted to plain identifiers', async () => {
  const { client } = fakeClient('draft');
  await assert.rejects(
    transitionState(client, {
      ...base,
      from: ['draft'],
      to: 'submitted',
      extraSet: { "status = 'x'; --": 1 },
    }),
    /refusing to set column/,
  );
});
