import { z } from 'zod';
import { CentsSchema, CurrencySchema } from './money';

export const ApprovalDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    comment: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.decision === 'approve' || (d.comment?.length ?? 0) > 0, {
    message: 'a rejection needs a comment',
    path: ['comment'],
  });
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApproverRoleSchema = z.enum([
  'manager',
  'cost_center_owner',
  'department_head',
  'finance_controller',
  'it_security',
  'legal',
  'cfo',
]);
export type ApproverRole = z.infer<typeof ApproverRoleSchema>;

export const ApprovalInboxItemSchema = z.object({
  stepId: z.string().uuid(),
  requisitionId: z.string().uuid(),
  requisitionNumber: z.string(),
  title: z.string(),
  requesterName: z.string(),
  totalCents: CentsSchema,
  currency: CurrencySchema,
  stepOrder: z.number().int().positive(),
  approverRole: ApproverRoleSchema,
  onBehalfOf: z.string().uuid().nullable(),
  dueAt: z.string().datetime().nullable(),
  overdue: z.boolean(),
});
export type ApprovalInboxItem = z.infer<typeof ApprovalInboxItemSchema>;

export const CreateDelegationSchema = z
  .object({
    delegateId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((d) => Date.parse(d.endsAt) > Date.parse(d.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type CreateDelegationInput = z.infer<typeof CreateDelegationSchema>;
