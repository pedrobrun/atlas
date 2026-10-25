import { ResolveExceptionSchema } from '@northwind/contracts';
import { bff } from '@/lib/bff';
import { invoicingApi } from '@/lib/invoicing-api';

export const POST = bff<{ id: string }>(
  async (request, session, { id }) => {
    const body = ResolveExceptionSchema.parse(await request.json());
    return invoicingApi(session, `/exceptions/${encodeURIComponent(id)}/resolve`, { method: 'POST', body });
  },
  ['finance'],
);
