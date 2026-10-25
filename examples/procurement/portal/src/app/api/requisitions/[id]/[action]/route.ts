import { NextResponse } from 'next/server';
import { WithdrawRequisitionSchema, type Requisition } from '@northwind/contracts';
import { bff } from '@/lib/bff';
import { procureApi } from '@/lib/procure-api';

const ACTIONS = ['submit', 'withdraw'] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

export const POST = bff<{ id: string; action: string }>(async (request, session, { id, action }) => {
  if (!isAction(action)) return NextResponse.json({ error: 'unknown action' }, { status: 404 });
  const path = `/requisitions/${encodeURIComponent(id)}/${action}`;
  if (action === 'submit') return procureApi<Requisition>(session, path, { method: 'POST' });

  const body = WithdrawRequisitionSchema.parse(await request.json());
  return procureApi<Requisition>(session, path, { method: 'POST', body });
});
