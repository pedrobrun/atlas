import { ApprovalDecisionSchema, CreateDelegationSchema } from '@northwind/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '@/db/pool';
import { listInbox } from './inbox.repo';
import { decide } from './approval.service';
import { activeDelegatorsFor, createDelegation } from './delegation';

const StepParams = z.object({ stepId: z.string().uuid() });
const RequisitionParams = z.object({ id: z.string().uuid() });

export async function approvalRoutes(app: FastifyInstance) {
  app.get('/approvals/inbox', async (request) => {
    const delegators = await activeDelegatorsFor(pool, request.actor.id);
    return listInbox(pool, request.actor.id, delegators);
  });

  app.post('/approvals/steps/:stepId/decision', async (request) => {
    const { stepId } = StepParams.parse(request.params);
    return decide(request.actor, stepId, ApprovalDecisionSchema.parse(request.body));
  });

  app.get('/approvals/requisitions/:id/chain', async (request) => {
    const { id } = RequisitionParams.parse(request.params);
    const { rows } = await pool.query(
      `SELECT s.id, s.step_order, s.approver_role, s.status, s.due_at, s.decided_at, s.comment, u.full_name AS approver_name
         FROM approval_steps s JOIN users u ON u.id = s.approver_id
        WHERE s.requisition_id = $1 ORDER BY s.step_order`,
      [id],
    );
    return { steps: rows };
  });

  app.post('/approvals/delegations', async (request, reply) => {
    const id = await createDelegation(request.actor, CreateDelegationSchema.parse(request.body));
    return reply.code(201).send({ id });
  });
}
