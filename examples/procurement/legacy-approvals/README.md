# legacy-approvals

> **Deprecated.** This app is being replaced by `procure-api/approvals`. Do not add features.
> Once approval emails link straight to the portal (tracked as PROC-412), this service and its
> DNS name (`approve.northwind-supply.example`) will be turned off.

A small Express app from the first version of the procurement system. It still serves one
thing: the **Approve** / **Reject** links inside approval emails.

How it works today:

1. `procure-api` (`src/notifications/approval-link.ts`) signs a token `{ stepId, approverId, decision, exp }`
   with `APPROVAL_LINK_SECRET` and puts `https://approve.northwind-supply.example/approve/<token>`
   in the email.
2. `GET /approve/:token` verifies the token and shows a confirmation page. It does not act on
   GET, because mail scanners prefetch links.
3. `POST /approve/:token` calls `procure-api` `POST /approvals/steps/:stepId/decision` on behalf of
   the approver. All approval logic, delegation and audit happen in procure-api.

Plain JavaScript (CommonJS), no build step. `node src/server.js`.
