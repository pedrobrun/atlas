# 0002. Approval rules as data, not code

Status: accepted

## Context

Approval thresholds change every budget cycle, and finance asks for category-specific reviews
(IT security for software, legal for professional services). They used to be `if` statements in
the approvals module, so each policy change needed an engineer and a deploy, and nobody could
answer "what was the policy on March 3rd?".

## Decision

Rules are rows in `approval_rules`: an optional category, an amount band, the approver role, and
a step order. `approvals/rules.ts` matches the rules and `approvals/chain-builder.ts` turns them
into concrete steps, resolving roles to people through `approver_assignments`, cost center
owners and the reporting line.

- Category rules compare against the spend _in that category_, not the requisition total.
- Each role appears in a chain once, and so does each person.
- A requester is never their own approver; that step goes to their manager.
- No matching rule is an error, never an automatic approval.
- Rule changes ship as SQL migrations that finance reviews, so git history is the policy history.
  The rule id is stored on each `approval_steps` row.

## Consequences

- Policy changes no longer touch TypeScript. The matching logic is pure and unit-tested.
- Rules cannot express arbitrary conditions (for example "vendor is new"). When we need one, we
  add a column, not a code path.
