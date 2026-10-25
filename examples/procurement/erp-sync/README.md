# erp-sync

Nightly job (Kubernetes CronJob, 02:30 UTC) that keeps NetSuite and the procurement platform in step.

Order of a run:

1. **Pull cost centers** (NetSuite departments with their annual budget) → `PUT procure-api /internal/cost-centers`
2. **Pull chart of accounts** → `PUT procure-api /internal/gl-accounts`
3. **Push purchase orders** changed since the last cursor (`GET procure-api /internal/purchase-orders`)
   → NetSuite purchase orders, upserted by external id `nw-po-<id>`
4. **Push paid invoices** (`GET invoicing /internal/invoices/paid`) → vendor bill (transformed from
   the PO) plus a vendor payment

NetSuite is reached over its REST API with plain `fetch` and OAuth 1.0 token-based auth
(`src/netsuite/oauth.ts`). There is no SDK.

## Retries and idempotency

Every outbound write has a key in the `sync_ledger` table (`po:<id>:v<version>`, `bill:<invoiceId>`,
...). A key that already succeeded is skipped. Failures back off exponentially and become
`dead` after 8 attempts or on a non-retryable error; dead rows are reported and need a human.
The cursor for a source only advances past records that are settled, so failed records are
fetched again the next night.

```
pnpm sync   # applies src/db/migrations/001_sync_store.sql, then runs
```
