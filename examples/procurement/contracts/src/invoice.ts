import { z } from 'zod';
import { CentsSchema, CurrencySchema } from './money';

export const InvoiceStatusSchema = z.enum([
  'received',
  'extracted',
  'matched',
  'exception',
  'paying',
  'paid',
  'rejected',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const ExceptionReasonSchema = z.enum([
  'extraction_failed',
  'low_confidence',
  'totals_inconsistent',
  'no_purchase_order',
  'purchase_order_not_synced',
  'match_variance',
  'budget_rejected',
  'payment_failed',
]);
export type ExceptionReason = z.infer<typeof ExceptionReasonSchema>;

export const InvoiceSummarySchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().nullable(),
  vendorId: z.string().uuid().nullable(),
  vendorName: z.string().nullable(),
  purchaseOrderNumber: z.string().nullable(),
  currency: CurrencySchema.nullable(),
  totalCents: CentsSchema.nullable(),
  status: InvoiceStatusSchema,
  dueDate: z.string().date().nullable(),
  receivedAt: z.string().datetime(),
  openException: z
    .object({ id: z.string().uuid(), reason: ExceptionReasonSchema, details: z.unknown() })
    .nullable(),
});
export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>;

export const ResolveExceptionSchema = z.object({
  resolution: z.enum(['accept_variance', 'reject_invoice']),
  note: z.string().trim().min(3).max(2000),
});
export type ResolveExceptionInput = z.infer<typeof ResolveExceptionSchema>;

export const PaidInvoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  vendorId: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  purchaseOrderNumber: z.string(),
  currency: CurrencySchema,
  subtotalCents: CentsSchema,
  taxCents: CentsSchema,
  totalCents: CentsSchema,
  paidAt: z.string().datetime(),
  stripeTransferId: z.string().startsWith('tr_'),
});
export type PaidInvoice = z.infer<typeof PaidInvoiceSchema>;

export const PaidInvoicesResponseSchema = z.object({
  invoices: z.array(PaidInvoiceSchema),
  nextCursor: z.string().datetime().nullable(),
});
