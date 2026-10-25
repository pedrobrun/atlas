import {
  CreateRequisitionSchema,
  UpdateRequisitionSchema,
  WithdrawRequisitionSchema,
} from '@northwind/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { submitRequisition, withdrawRequisition } from './requisition-lifecycle';
import * as service from './requisition.service';

const IdParams = z.object({ id: z.string().uuid() });

export async function requisitionRoutes(app: FastifyInstance) {
  app.get('/requisitions/mine', async (request) => service.listMyRequisitions(request.actor));

  app.post('/requisitions', async (request, reply) => {
    const input = CreateRequisitionSchema.parse(request.body);
    return reply.code(201).send(await service.createRequisition(request.actor, input));
  });

  app.get('/requisitions/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    return service.getRequisition(request.actor, id);
  });

  app.patch('/requisitions/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    return service.editRequisition(request.actor, id, UpdateRequisitionSchema.parse(request.body));
  });

  app.post('/requisitions/:id/submit', async (request) => {
    const { id } = IdParams.parse(request.params);
    return submitRequisition(request.actor, id);
  });

  app.post('/requisitions/:id/withdraw', async (request) => {
    const { id } = IdParams.parse(request.params);
    const { reason } = WithdrawRequisitionSchema.parse(request.body);
    return withdrawRequisition(request.actor, id, reason);
  });
}
