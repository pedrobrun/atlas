# 0001. SQS between procure-api and invoicing

Status: accepted

## Context

`invoicing` needs every issued, amended and cancelled PO and every goods receipt to run the
three-way match. The first version had invoicing call `GET /internal/purchase-orders/:id` when
an invoice arrived. During month-end close, procure-api deploys or slowdowns stalled invoice
ingestion, and invoices that arrived before their PO had no way to learn when it appeared.

## Decision

procure-api publishes domain events (`purchase_order.issued`, `purchase_order.amended`,
`purchase_order.cancelled`, `goods.received`, `requisition.approved`) to one SQS FIFO queue,
`procurement-events.fifo`. invoicing keeps a local mirror of POs and receipts built from those
events.

- Events are written to an `outbox` table in the same transaction as the state change and
  relayed by `queue/outbox-relay.job.ts`. A rolled-back change never publishes an event.
- `MessageGroupId` is the PO id, so all events about one PO arrive in order.
  `MessageDeduplicationId` is the event id, which absorbs relay retries inside SQS's 5-minute window.
- Payload schemas live in `@northwind/contracts` and carry `schemaVersion`.
- A redrive policy sends a message to `procurement-events-dlq.fifo` after 5 failed receives.

invoicing still calls procure-api over HTTP when it needs an answer now: budget consumption on
match, and the vendor's payout account at payment time.

## Consequences

- invoicing keeps ingesting and matching while procure-api is down.
- The PO mirror is eventually consistent. An invoice can arrive before its PO event; it is
  parked as `purchase_order_not_synced` and re-matched when the event lands.
- We picked SQS over Kafka: the volume is a few thousand events a day, and we already run on AWS.
