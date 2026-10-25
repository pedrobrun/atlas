import { CreateRequisitionSchema, type Requisition } from '@northwind/contracts';
import { bff } from '@/lib/bff';
import { procureApi } from '@/lib/procure-api';

export const GET = bff((_request, session) => procureApi<Requisition[]>(session, '/requisitions/mine'));

export const POST = bff(async (request, session) => {
  const input = CreateRequisitionSchema.parse(await request.json());
  return procureApi<Requisition>(session, '/requisitions', { method: 'POST', body: input });
});
