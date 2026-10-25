import { z } from 'zod';
import { CentsSchema, CurrencySchema } from './money';
import { CategoryCodeSchema } from './requisition';

export const PurchaseOrderStatusSchema = z.enum(['issued', 'amended', 'cancelled', 'closed']);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;

export const PurchaseOrderLineSchema = z.object({
  lineNo: z.number().int().positive(),
  description: z.string().min(1),
  categoryCode: CategoryCodeSchema,
  quantity: z.number().int().positive(),
  unitPriceCents: CentsSchema,
  glAccountNumber: z.string().nullable(),
});
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLineSchema>;

export const PurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  number: z.string().regex(/^PO-\d{4}-\d{6}$/),
  requisitionId: z.string().uuid(),
  vendorId: z.string().uuid(),
  vendorName: z.string(),
  vendorExternalId: z.string().nullable(),
  costCenterId: z.string().uuid(),
  costCenterCode: z.string(),
  costCenterExternalId: z.string().nullable(),
  currency: CurrencySchema,
  totalCents: CentsSchema,
  invoicedCents: CentsSchema,
  status: PurchaseOrderStatusSchema,
  version: z.number().int().positive(),
  lines: z.array(PurchaseOrderLineSchema).min(1),
  issuedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const IssuePurchaseOrderSchema = z.object({
  requisitionId: z.string().uuid(),
  vendorId: z.string().uuid(),
});

export const AmendPurchaseOrderSchema = z.object({
  lines: z
    .array(PurchaseOrderLineSchema.extend({ glAccountNumber: z.string().nullable().default(null) }))
    .min(1),
  reason: z.string().trim().min(3).max(1000),
});
export type AmendPurchaseOrderInput = z.infer<typeof AmendPurchaseOrderSchema>;

export const CancelPurchaseOrderSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const ReceiptLineSchema = z.object({
  lineNo: z.number().int().positive(),
  quantityReceived: z.number().int().positive(),
});

export const RecordReceiptSchema = z.object({
  lines: z.array(ReceiptLineSchema).min(1),
});
export type RecordReceiptInput = z.infer<typeof RecordReceiptSchema>;

export const GoodsReceiptSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  lines: z.array(ReceiptLineSchema).min(1),
  receivedBy: z.string(),
  receivedAt: z.string().datetime(),
});
export type GoodsReceipt = z.infer<typeof GoodsReceiptSchema>;

export const InvoicedAmountSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: CentsSchema.positive(),
  currency: CurrencySchema,
});
export type InvoicedAmount = z.infer<typeof InvoicedAmountSchema>;

export const SyncablePurchaseOrdersSchema = z.object({
  purchaseOrders: z.array(PurchaseOrderSchema),
  nextCursor: z.string().datetime().nullable(),
});
