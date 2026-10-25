import { PaidInvoicesResponseSchema, type PaidInvoice } from '@northwind/contracts';
import { callService } from './http';

export async function* paidInvoicesSince(since: Date): AsyncGenerator<PaidInvoice> {
  const target = {
    name: 'invoicing' as const,
    baseUrl: process.env.INVOICING_API_URL,
    token: process.env.INVOICING_SERVICE_TOKEN,
  };
  let cursor: string | null = since.toISOString();
  while (cursor) {
    const page = PaidInvoicesResponseSchema.parse(
      await callService(
        target,
        'GET',
        `/internal/invoices/paid?since=${encodeURIComponent(cursor)}&limit=200`,
      ),
    );
    yield* page.invoices;
    cursor = page.nextCursor;
  }
}
