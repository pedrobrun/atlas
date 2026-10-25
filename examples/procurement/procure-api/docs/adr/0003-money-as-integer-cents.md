# 0003. Money as integer cents end to end

Status: accepted

## Decision

Every amount is an integer number of minor units (`*_cents`, `BIGINT` in Postgres) from the
portal form to the Stripe transfer. Helpers live in `@northwind/contracts` (`multiplyCents`,
`sumCents`, `parseDecimalToCents`); they throw instead of losing precision past
`Number.MAX_SAFE_INTEGER`. The pg driver is configured to parse `INT8` as a number and to refuse
unsafe values.

Decimal strings exist only at two boundaries: LLM-extracted invoice fields (parsed with
`parseDecimalToCents`) and NetSuite REST payloads (formatted with `centsToDecimalString`).

## Consequences

Tolerance rules use basis points and integer comparisons (`diff * 10_000 <= base * bps`).
There is no float rounding anywhere in matching, budgets or payouts.
