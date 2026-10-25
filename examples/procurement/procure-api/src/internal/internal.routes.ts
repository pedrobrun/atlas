import {
  CostCenterSyncBatchSchema,
  GlAccountSyncBatchSchema,
  InvoicedAmountSchema,
} from '@northwind/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { upsertCostCenters, upsertGlAccounts } from '@/budgets/cost-center.repo';
import { pool, withTransaction } from '@/db/pool';
import { NotFoundError } from '@/errors';
import { requireService } from '@/http/auth';
import { findPurchaseOrder, listUpdatedSince } from '@/purchase-orders/po.repo';
import { recordInvoiced } from '@/purchase-orders/po-invoicing.service';
import { getPayoutAccount } from '@/vendors/payout-account';

const IdParams = z.object({ id: z.string().uuid() });
const SinceQuery = z.object({
  updatedSince: z.string().datetime().default('1970-01-01T00:00:00.000Z'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function internalRoutes(app: FastifyInstance) {
  app.get(
    '/internal/purchase-orders/:id',
    { preHandler: requireService('invoicing', 'erp-sync') },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      const po = await findPurchaseOrder(pool, id);
      if (!po) throw new NotFoundError('purchase order', id);
      return po;
    },
  );

  app.get('/internal/purchase-orders', { preHandler: requireService('erp-sync') }, async (request) => {
    const { updatedSince, limit } = SinceQuery.parse(request.query);
    const purchaseOrders = await listUpdatedSince(pool, new Date(updatedSince), limit);
    const last = purchaseOrders.at(-1);
    return { purchaseOrders, nextCursor: purchaseOrders.length === limit && last ? last.updatedAt : null };
  });

  app.post(
    '/internal/purchase-orders/:id/invoiced',
    { preHandler: requireService('invoicing') },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      return recordInvoiced(request.actor, id, InvoicedAmountSchema.parse(request.body));
    },
  );

  app.get(
    '/internal/vendors/:id/payout-account',
    { preHandler: requireService('invoicing') },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      return getPayoutAccount(id);
    },
  );

  app.put('/internal/cost-centers', { preHandler: requireService('erp-sync') }, async (request) => {
    const batch = CostCenterSyncBatchSchema.parse(request.body);
    return withTransaction((client) => upsertCostCenters(client, batch.costCenters, request.actor.id));
  });

  app.put('/internal/gl-accounts', { preHandler: requireService('erp-sync') }, async (request) => {
    const batch = GlAccountSyncBatchSchema.parse(request.body);
    return withTransaction((client) => upsertGlAccounts(client, batch.accounts));
  });
}
