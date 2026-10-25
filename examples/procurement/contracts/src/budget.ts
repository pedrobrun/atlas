import { z } from 'zod';
import { CentsSchema, CurrencySchema } from './money';

export const BudgetSummarySchema = z.object({
  costCenterId: z.string().uuid(),
  costCenterCode: z.string(),
  costCenterName: z.string(),
  fiscalYear: z.number().int(),
  currency: CurrencySchema,
  allocatedCents: CentsSchema,
  reservedCents: CentsSchema,
  consumedCents: CentsSchema,
  availableCents: CentsSchema,
  utilizationBps: z.number().int().nonnegative(),
});
export type BudgetSummary = z.infer<typeof BudgetSummarySchema>;

export const BudgetDashboardSchema = z.object({
  fiscalYear: z.number().int(),
  budgets: z.array(BudgetSummarySchema),
});
export type BudgetDashboard = z.infer<typeof BudgetDashboardSchema>;

export const BudgetMovementSchema = z.object({
  kind: z.enum(['reserve', 'release', 'consume']),
  amountCents: CentsSchema.positive(),
  requisitionId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().nullable(),
  invoiceId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type BudgetMovement = z.infer<typeof BudgetMovementSchema>;
