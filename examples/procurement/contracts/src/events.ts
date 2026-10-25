import { z } from 'zod';
import { CentsSchema, CurrencySchema } from './money';
import { GoodsReceiptSchema, PurchaseOrderSchema } from './purchase-order';

function envelope<T extends string, P extends z.ZodTypeAny>(type: T, payload: P) {
  return z.object({
    eventId: z.string().uuid(),
    type: z.literal(type),
    occurredAt: z.string().datetime(),
    schemaVersion: z.literal(1),
    payload,
  });
}

export const RequisitionApprovedEventSchema = envelope(
  'requisition.approved',
  z.object({
    requisitionId: z.string().uuid(),
    costCenterId: z.string().uuid(),
    totalCents: CentsSchema,
    currency: CurrencySchema,
    approvedAt: z.string().datetime(),
  }),
);

export const PurchaseOrderIssuedEventSchema = envelope(
  'purchase_order.issued',
  z.object({ purchaseOrder: PurchaseOrderSchema }),
);

export const PurchaseOrderAmendedEventSchema = envelope(
  'purchase_order.amended',
  z.object({ purchaseOrder: PurchaseOrderSchema, previousTotalCents: CentsSchema }),
);

export const PurchaseOrderCancelledEventSchema = envelope(
  'purchase_order.cancelled',
  z.object({ purchaseOrderId: z.string().uuid(), reason: z.string(), cancelledAt: z.string().datetime() }),
);

export const GoodsReceivedEventSchema = envelope('goods.received', z.object({ receipt: GoodsReceiptSchema }));

export const ProcurementEventSchema = z.discriminatedUnion('type', [
  RequisitionApprovedEventSchema,
  PurchaseOrderIssuedEventSchema,
  PurchaseOrderAmendedEventSchema,
  PurchaseOrderCancelledEventSchema,
  GoodsReceivedEventSchema,
]);

export type ProcurementEvent = z.infer<typeof ProcurementEventSchema>;
export type ProcurementEventType = ProcurementEvent['type'];
export type EventOf<T extends ProcurementEventType> = Extract<ProcurementEvent, { type: T }>;

// SQS FIFO orders messages per group, so every event about one PO shares a group.
export function messageGroupId(event: ProcurementEvent): string {
  switch (event.type) {
    case 'requisition.approved':
      return `requisition:${event.payload.requisitionId}`;
    case 'purchase_order.issued':
    case 'purchase_order.amended':
      return `po:${event.payload.purchaseOrder.id}`;
    case 'purchase_order.cancelled':
      return `po:${event.payload.purchaseOrderId}`;
    case 'goods.received':
      return `po:${event.payload.receipt.purchaseOrderId}`;
  }
}
