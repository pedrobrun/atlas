import {
  BankAccountInputSchema,
  KybResultSchema,
  OnboardVendorSchema,
  SetPayoutAccountSchema,
  VendorStatusSchema,
} from '@northwind/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '@/db/pool';
import { requireRole } from '@/http/auth';
import { searchVendors } from './vendor.repo';
import { setPayoutAccount } from './payout-account';
import * as service from './vendor.service';

const IdParams = z.object({ id: z.string().uuid() });
const SearchQuery = z.object({
  q: z.string().trim().min(1).optional(),
  status: VendorStatusSchema.optional(),
});
const StatusBody = z.object({ status: z.enum(['suspended', 'active']), reason: z.string().trim().min(3) });

export async function vendorRoutes(app: FastifyInstance) {
  app.get('/vendors', async (request) => {
    const { q, status } = SearchQuery.parse(request.query);
    return searchVendors(pool, q, status);
  });

  app.post('/vendors', { preHandler: requireRole('buyer', 'finance') }, async (request, reply) => {
    return reply
      .code(201)
      .send(await service.onboardVendor(request.actor, OnboardVendorSchema.parse(request.body)));
  });

  app.post('/vendors/:id/kyb', { preHandler: requireRole('finance') }, async (request) => {
    const { id } = IdParams.parse(request.params);
    return service.completeKyb(request.actor, id, KybResultSchema.parse(request.body));
  });

  app.post('/vendors/:id/status', { preHandler: requireRole('finance') }, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { status, reason } = StatusBody.parse(request.body);
    await service.setVendorStatus(request.actor, id, status, reason);
    return { ok: true };
  });

  app.post('/vendors/:id/bank-accounts', { preHandler: requireRole('finance') }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const accountId = await service.addBankAccount(
      request.actor,
      id,
      BankAccountInputSchema.parse(request.body),
    );
    return reply.code(201).send({ id: accountId });
  });

  app.put('/vendors/:id/payout-account', { preHandler: requireRole('finance') }, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { stripeAccountId, payoutCurrency } = SetPayoutAccountSchema.parse(request.body);
    await setPayoutAccount(request.actor, id, stripeAccountId, payoutCurrency);
    return { ok: true };
  });
}
