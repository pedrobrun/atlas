import type { EventOf, RecordReceiptInput } from '@northwind/contracts';
import { appendAuditEvent } from '@/audit/audit-log';
import { withTransaction } from '@/db/pool';
import { ConflictError, InvariantViolation, NotFoundError } from '@/errors';
import type { Actor } from '@/http/auth';
import { buildEvent, enqueueEvent } from '@/queue/outbox';
import { insertGoodsReceipt, receivedQuantities } from './goods-receipt.repo';
import { findPurchaseOrder } from './po.repo';

export async function recordGoodsReceipt(
  actor: Actor,
  poId: string,
  input: RecordReceiptInput,
): Promise<string> {
  return withTransaction(async (client) => {
    const po = await findPurchaseOrder(client, poId, { forUpdate: true });
    if (!po) throw new NotFoundError('purchase order', poId);
    if (po.status !== 'issued' && po.status !== 'amended') {
      throw new ConflictError(`cannot receive against a ${po.status} PO`);
    }

    const ordered = new Map(po.lines.map((l) => [l.lineNo, l.quantity]));
    const received = await receivedQuantities(client, poId);
    for (const line of input.lines) {
      const quantity = ordered.get(line.lineNo);
      if (quantity === undefined)
        throw new InvariantViolation('receipt_line_exists', `PO has no line ${line.lineNo}`);
      const total = (received.get(line.lineNo) ?? 0) + line.quantityReceived;
      if (total > quantity) {
        throw new InvariantViolation(
          'receipt_within_ordered',
          `line ${line.lineNo}: receiving ${total} of ${quantity}`,
        );
      }
    }

    const receipt = await insertGoodsReceipt(client, poId, actor.id, input.lines);
    await appendAuditEvent(client, {
      entityType: 'goods_receipt',
      entityId: receipt.id,
      action: 'received',
      actorId: actor.id,
      payload: { purchaseOrderId: poId, lines: input.lines },
    });
    await enqueueEvent(
      client,
      buildEvent<EventOf<'goods.received'>>('goods.received', {
        receipt: {
          id: receipt.id,
          purchaseOrderId: poId,
          lines: input.lines,
          receivedBy: actor.id,
          receivedAt: receipt.receivedAt.toISOString(),
        },
      }),
    );
    return receipt.id;
  });
}
