# procure-api

The core procurement service for Northwind Supply. A Fastify HTTP API over Postgres.

| Module            | Responsibility                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `requisitions`    | Create, edit, submit and withdraw purchase requests with line items                                |
| `approvals`       | Rule-driven approval chains (rules live in the `approval_rules` table), delegation, SLA escalation |
| `budgets`         | Cost-center budgets: reserve on approval, release on cancel, consume when invoices match           |
| `vendors`         | Onboarding, KYB risk scoring, bank details, Stripe payout account                                  |
| `purchase-orders` | Issue a PO from an approved requisition, amend, cancel, goods receipts                             |
| `contracts`       | Vendor contracts sent for signature through DocuSign                                               |
| `catalog`         | Punch-out catalog with preferred-vendor pricing                                                    |
| `audit`           | Append-only event log; every state change goes through `audit/audited-transition.ts`               |
| `notifications`   | Slack DMs and SendGrid email                                                                       |
| `queue`           | Transactional outbox relayed to the `procurement-events` SQS FIFO queue                            |
| `internal`        | Endpoints for `invoicing` and `erp-sync` only                                                      |

## Invariants

- A PO never exceeds its approved requisition amount (`purchase-orders/po-ceiling.ts`).
- Budgets never go negative (`budgets/overspend-guard.ts`, plus a CHECK constraint).
- Every state change writes an audit event in the same transaction (`audit/audited-transition.ts`).

## Running

```
pnpm migrate && pnpm dev
pnpm test
```

Decisions are recorded in `docs/adr/`.
