import { z } from 'zod';
import { CentsSchema, CurrencySchema } from './money';

export const RequisitionStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'withdrawn',
  'ordered',
]);
export type RequisitionStatus = z.infer<typeof RequisitionStatusSchema>;

export const CategoryCodeSchema = z
  .string()
  .regex(/^[a-z]+(-[a-z]+)*$/, 'category codes are kebab-case, e.g. it-hardware');

export const LineItemInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  categoryCode: CategoryCodeSchema,
  quantity: z.number().int().positive().max(1_000_000),
  unitPriceCents: CentsSchema,
  catalogItemId: z.string().uuid().nullable().default(null),
});
export type LineItemInput = z.infer<typeof LineItemInputSchema>;

export const CreateRequisitionSchema = z.object({
  title: z.string().trim().min(3).max(200),
  justification: z.string().trim().max(4000).default(''),
  costCenterId: z.string().uuid(),
  vendorId: z.string().uuid().nullable().default(null),
  currency: CurrencySchema,
  neededBy: z.string().date().nullable().default(null),
  lineItems: z.array(LineItemInputSchema).min(1).max(200),
});
export type CreateRequisitionInput = z.infer<typeof CreateRequisitionSchema>;

export const UpdateRequisitionSchema = CreateRequisitionSchema.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  'an update must change at least one field',
);
export type UpdateRequisitionInput = z.infer<typeof UpdateRequisitionSchema>;

export const WithdrawRequisitionSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const RequisitionLineSchema = z.object({
  lineNo: z.number().int().positive(),
  description: z.string(),
  categoryCode: CategoryCodeSchema,
  quantity: z.number().int().positive(),
  unitPriceCents: CentsSchema,
  catalogItemId: z.string().uuid().nullable(),
});
export type RequisitionLine = z.infer<typeof RequisitionLineSchema>;

export const RequisitionSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  requesterId: z.string().uuid(),
  costCenterId: z.string().uuid(),
  vendorId: z.string().uuid().nullable(),
  title: z.string(),
  justification: z.string(),
  currency: CurrencySchema,
  totalCents: CentsSchema,
  status: RequisitionStatusSchema,
  neededBy: z.string().date().nullable(),
  submittedAt: z.string().datetime().nullable(),
  approvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  lines: z.array(RequisitionLineSchema),
});
export type Requisition = z.infer<typeof RequisitionSchema>;
