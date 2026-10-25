# invoicing

Accounts-payable worker for Northwind Supply. Turns supplier invoices into vendor payments.

1. **Ingestion**: invoices arrive by email (SendGrid Inbound Parse → `POST /ingest/email`) or
   upload from the portal (`POST /invoices/upload`). PDFs go to S3; fields are extracted with
   OpenAI and validated with zod before anything is stored as data.
2. **PO mirror**: consumes the `procurement-events.fifo` SQS queue published by `procure-api`
   to keep a local copy of POs and goods receipts (see procure-api ADR 0001).
3. **Three-way match**: PO vs goods receipt vs invoice, with price and quantity tolerances.
   A match is reported to procure-api, which consumes the budget.
4. **Exceptions**: anything that does not match lands in a queue that finance resolves in the portal.
5. **Payment runs**: a daily run pays matched, budget-confirmed invoices through Stripe Connect
   transfers. Each invoice is paid at most once: one `payments` row per invoice and an idempotency
   key derived only from the invoice id.

`GET /internal/invoices/paid` feeds `erp-sync`.

```
pnpm migrate && pnpm dev
pnpm test
```
