import {
  AmendPurchaseOrderSchema,
  CancelPurchaseOrderSchema,
  IssuePurchaseOrderSchema,
  RecordReceiptSchema,
} from '@northwind/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '@/db/pool';
import { NotFoundError } from '@/errors';
import { requireRole } from '@/http/auth';
import { recordGoodsReceipt } from './goods-receipt.service';
import { findPurchaseOrder } from './po.repo';
import { amendPurchaseOrder, cancelPurchaseOrder } from './po-changes.service';
import { issueForRequisition } from './po.service';

const IdParams = z.object({ id: z.string().uuid() });

export async function purchaseOrderRoutes(app: FastifyInstance) {
  app.get('/purchase-orders/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    const po = await findPurchaseOrder(pool, id);
    if (!po) throw new NotFoundError('purchase order', id);
    return po;
  });

  app.post('/purchase-orders', { preHandler: requireRole('buyer') }, async (request, reply) => {
    const { requisitionId, vendorId } = IssuePurchaseOrderSchema.parse(request.body);
    return reply.code(201).send(await issueForRequisition(request.actor, requisitionId, vendorId));
  });

  app.post('/purchase-orders/:id/amend', { preHandler: requireRole('buyer') }, async (request) => {
    const { id } = IdParams.parse(request.params);
    return amendPurchaseOrder(request.actor, id, AmendPurchaseOrderSchema.parse(request.body));
  });

  app.post(
    '/purchase-orders/:id/cancel',
    { preHandler: requireRole('buyer', 'finance') },
    async (request) => {
      const { id } = IdParams.parse(request.params);
      await cancelPurchaseOrder(request.actor, id, CancelPurchaseOrderSchema.parse(request.body).reason);
      return { ok: true };
    },
  );

  app.post('/purchase-orders/:id/receipts', async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const receiptId = await recordGoodsReceipt(request.actor, id, RecordReceiptSchema.parse(request.body));
    return reply.code(201).send({ id: receiptId });
  });
}
