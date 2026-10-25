import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '@/db/pool';
import { preferredVendorsByCategory, searchItems, tiersFor } from './catalog.repo';
import { quote } from './pricing';
import { parseOciCart } from './punchout';

const SearchQuery = z.object({
  q: z.string().trim().min(2),
  quantity: z.coerce.number().int().positive().default(1),
});

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/catalog/items', async (request) => {
    const { q, quantity } = SearchQuery.parse(request.query);
    const items = await searchItems(pool, q);
    const [tiers, preferred] = await Promise.all([
      tiersFor(
        pool,
        items.map((i) => i.id),
      ),
      preferredVendorsByCategory(pool, [...new Set(items.map((i) => i.categoryCode))]),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return items.map((item) => ({
      ...item,
      quote: quote(tiers.get(item.id) ?? [], {
        quantity,
        on: today,
        preferredVendorIds: preferred.get(item.categoryCode) ?? new Set(),
      }),
    }));
  });

  app.post('/catalog/punchout/return', async (request) => {
    const form = z.record(z.string(), z.string()).parse(request.body);
    const lines = parseOciCart(form);
    return {
      lineItems: lines.map((l) => ({
        description: `${l.description}${l.supplierSku ? ` (${l.supplierSku})` : ''}`,
        categoryCode: l.categoryCode,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        catalogItemId: null,
      })),
      currency: lines[0]?.currency ?? 'USD',
    };
  });
}
