import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '@/db/pool';
import { requireRole } from '@/http/auth';
import { listAuditEvents } from './audit-log';

const Params = z.object({
  entityType: z.enum([
    'requisition',
    'approval_step',
    'approval_delegation',
    'budget',
    'purchase_order',
    'goods_receipt',
    'vendor',
    'vendor_contract',
    'cost_center',
  ]),
  entityId: z.string().min(1).max(64),
});

export async function auditRoutes(app: FastifyInstance) {
  app.get('/audit/:entityType/:entityId', { preHandler: requireRole('finance') }, async (request) => {
    const { entityType, entityId } = Params.parse(request.params);
    return { events: await listAuditEvents(pool, entityType, entityId) };
  });
}
