import { OnboardVendorSchema } from '@northwind/contracts';
import { bff } from '@/lib/bff';
import { procureApi } from '@/lib/procure-api';

export const GET = bff((request, session) => {
  const q = new URL(request.url).searchParams.get('q');
  return procureApi(session, `/vendors${q ? `?q=${encodeURIComponent(q)}` : ''}`);
});

export const POST = bff(
  async (request, session) => {
    const input = OnboardVendorSchema.parse(await request.json());
    return procureApi(session, '/vendors', { method: 'POST', body: input });
  },
  ['buyer', 'finance'],
);
