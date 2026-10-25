import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '@/db/pool';
import { listPaidSince } from '@/invoices/invoice-queries';

const Query = z.object({
  since: z.string().datetime().default('1970-01-01T00:00:00.000Z'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Paid invoices for erp-sync, ordered by paid_at so the caller can page with a cursor. */
export async function internalRoutes(app: FastifyInstance) {
  app.get('/internal/invoices/paid', async (request) => {
    const { since, limit } = Query.parse(request.query);
    const invoices = await listPaidSince(pool, new Date(since), limit);
    const last = invoices.at(-1);
    return { invoices, nextCursor: invoices.length === limit && last ? last.paidAt : null };
  });
}
