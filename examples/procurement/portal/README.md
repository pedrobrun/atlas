# portal

The Northwind Supply procurement portal: a Next.js (app router) frontend for requesters,
approvers, buyers and finance.

| Page                    | Route                   | Backed by                                |
| ----------------------- | ----------------------- | ---------------------------------------- |
| New purchase request    | `/requests/new`         | `POST /api/requisitions` → procure-api   |
| My requests             | `/requests`             | procure-api `GET /requisitions/mine`     |
| Approval inbox          | `/approvals`            | procure-api `GET /approvals/inbox`       |
| Vendor directory        | `/vendors`              | procure-api `GET /vendors`               |
| PO detail               | `/purchase-orders/[id]` | procure-api `GET /purchase-orders/:id`   |
| Invoices awaiting match | `/invoices`             | invoicing `GET /invoices/awaiting-match` |
| Budget dashboard        | `/budgets`              | procure-api `GET /budgets`               |

Server components call the backends directly through `src/lib/procure-api.ts` and
`src/lib/invoicing-api.ts`. Browser mutations go through the `src/app/api/*` route handlers,
a thin BFF that attaches the service token and the signed-in user. Backend tokens never reach
the browser.

Authentication is done by the company SSO gateway, which sets a signed `nw_session` cookie;
`src/lib/session.ts` verifies it.
