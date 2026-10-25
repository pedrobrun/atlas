import type { BudgetDashboard, BudgetMovement } from '@northwind/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '@/db/pool';
import { requireRole } from '@/http/auth';
import { budgetDashboard, fiscalYearOf } from './budget.service';

const YearQuery = z.object({ fiscalYear: z.coerce.number().int().min(2000).max(2100).optional() });
const CostCenterParams = z.object({ costCenterId: z.string().uuid() });

export async function budgetRoutes(app: FastifyInstance) {
  app.get('/budgets', async (request): Promise<BudgetDashboard> => {
    const fiscalYear = YearQuery.parse(request.query).fiscalYear ?? fiscalYearOf();
    return { fiscalYear, budgets: await budgetDashboard(fiscalYear) };
  });

  app.get(
    '/budgets/:costCenterId/movements',
    { preHandler: requireRole('finance', 'approver') },
    async (request): Promise<{ movements: BudgetMovement[] }> => {
      const { costCenterId } = CostCenterParams.parse(request.params);
      const fiscalYear = YearQuery.parse(request.query).fiscalYear ?? fiscalYearOf();
      const { rows } = await pool.query(
        `SELECT m.kind, m.amount_cents, m.requisition_id, m.purchase_order_id, m.invoice_id, m.created_at
           FROM budget_movements m JOIN budgets b ON b.id = m.budget_id
          WHERE b.cost_center_id = $1 AND b.fiscal_year = $2 ORDER BY m.id DESC LIMIT 500`,
        [costCenterId, fiscalYear],
      );
      return {
        movements: rows.map((r) => ({
          kind: r.kind,
          amountCents: r.amount_cents,
          requisitionId: r.requisition_id,
          purchaseOrderId: r.purchase_order_id,
          invoiceId: r.invoice_id,
          createdAt: r.created_at.toISOString(),
        })),
      };
    },
  );
}
