# @northwind/contracts

Zod schemas and TypeScript types for every payload that crosses a service boundary:

- HTTP bodies between `portal`, `procure-api`, `invoicing` and `erp-sync`
- the `procurement-events` SQS messages published by `procure-api` and consumed by `invoicing`
- money helpers (all amounts are integer cents)

Consumed through the pnpm workspace as `"@northwind/contracts": "workspace:*"`. There is no build
step; consumers import the TypeScript sources directly.

Changing a schema is a cross-service change. Add fields as optional first, deploy consumers, then
tighten. Queue events carry `schemaVersion` so a consumer can tell old messages apart.
