# Northwind Supply procurement platform

Internal procurement system for Northwind Supply: purchase requests, approval chains, budgets,
purchase orders, invoice matching, vendor payments and the nightly NetSuite sync.

This is a fictional example codebase used to showcase Atlas. It is meant to be read, not run.

| Repo               | What it does                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `portal`           | Next.js app for requesters, approvers and finance. Its `/api` routes are a BFF over `procure-api` and `invoicing`. |
| `procure-api`      | Core service: requisitions, approvals, budgets, vendors, POs, vendor contracts, catalog, audit log.                |
| `invoicing`        | Worker: invoice ingestion (email/upload, S3, LLM extraction), three-way match, exceptions, Stripe payment runs.    |
| `erp-sync`         | Nightly job: pushes POs and paid invoices to NetSuite, pulls cost centers and the chart of accounts back.          |
| `contracts`        | `@northwind/contracts`: zod schemas and types for every HTTP and queue payload shared between services.            |
| `legacy-approvals` | Old Express app serving "approve by link" from approval emails. Being replaced by `procure-api/approvals`.         |

## The main flow

```
portal ──HTTP──▶ procure-api: requisition → approval chain → budget reservation → PO issued
                      │ (outbox → SQS FIFO "procurement-events")
                      ▼
                 invoicing: PO mirror + goods receipts ◀── invoice PDF (email / upload → S3 → OpenAI)
                      │ three-way match → exception queue or matched
                      │ HTTP: budget consumption back to procure-api
                      ▼
                 payment run → Stripe transfer (idempotency key per invoice)
                      ▼
                 erp-sync (nightly) ──REST──▶ NetSuite
```
