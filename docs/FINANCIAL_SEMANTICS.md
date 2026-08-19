# Financial semantics

## Money

All persisted and calculated monetary values use signed integer minor units plus an ISO 4217 currency code. Display input is parsed as a decimal string and converted without floating-point multiplication. For a two-decimal currency, display `35292` becomes `3529200` minor units. Formatting divides only at the presentation boundary.

Cross-currency arithmetic is invalid unless an explicit exchange-rate operation produces a new valued amount. Currency precision beyond two decimals must be added as currency metadata before supporting those currencies.

## Ledger

Accounts have an opening balance. Transactions describe user meaning; entries describe account impact. Income, expense, transfer, and adjustment are distinct kinds. Transfers must eventually produce balanced paired entries and must not count as income or expense.

Phase 1 includes only boundary types and small pure helpers. Balanced-entry, deletion, refund, reconciliation, and transfer invariants are Phase 2 specifications, not simulated behavior.

## Dates and time

Planned financial events use date-only `YYYY-MM-DD` values. User configuration owns the IANA timezone. Pure calculations receive an explicit `asOfDate`; they never infer “today” from the browser clock. Audit and sync timestamps remain instants.

## Forecasting and read models

Forecasts are derived from normalized transactions, recurring rules, and explicitly active scenarios. Screens consume read models for overview, cash flow, funds, and charts. A chart is presentation, never a source of financial calculations.
