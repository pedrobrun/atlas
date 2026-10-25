import { z } from 'zod';
import { CentsSchema, CurrencySchema } from './money';

export const CostCenterSyncSchema = z.object({
  externalId: z.string().min(1),
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  active: z.boolean(),
  currency: CurrencySchema,
  fiscalYear: z.number().int().min(2000).max(2100),
  annualBudgetCents: CentsSchema.nullable(),
});
export type CostCenterSync = z.infer<typeof CostCenterSyncSchema>;

export const CostCenterSyncBatchSchema = z.object({
  costCenters: z.array(CostCenterSyncSchema).max(5000),
  syncedAt: z.string().datetime(),
});
export type CostCenterSyncBatch = z.infer<typeof CostCenterSyncBatchSchema>;

export const GlAccountTypeSchema = z.enum(['expense', 'asset', 'liability', 'income', 'equity']);

export const GlAccountSyncSchema = z.object({
  externalId: z.string().min(1),
  number: z.string().min(1),
  name: z.string().min(1),
  type: GlAccountTypeSchema,
  active: z.boolean(),
});
export type GlAccountSync = z.infer<typeof GlAccountSyncSchema>;

export const GlAccountSyncBatchSchema = z.object({
  accounts: z.array(GlAccountSyncSchema).max(10000),
  syncedAt: z.string().datetime(),
});
export type GlAccountSyncBatch = z.infer<typeof GlAccountSyncBatchSchema>;

export const SyncResultSchema = z.object({
  upserted: z.number().int().nonnegative(),
  deactivated: z.number().int().nonnegative(),
  clamped: z.array(z.string()),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;
