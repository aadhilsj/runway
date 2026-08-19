# Financial semantics

## Money

All persisted and calculated monetary values use signed integer minor units plus an ISO 4217 currency code. Display input is parsed as a decimal string and converted without floating-point multiplication. For a two-decimal currency, display `35292` becomes `3529200` minor units. Formatting divides only at the presentation boundary.

Cross-currency arithmetic is invalid unless an explicit exchange-rate operation produces a new valued amount. Currency precision beyond two decimals must be added as currency metadata before supporting those currencies.

## Ledger

Transactions describe user meaning; entries describe account impact. Income, expense, transfer, refund, reimbursement, debt payment, opening balance, and adjustment are distinct kinds.

Posted transactions must contain at least two non-zero entries whose integer minor-unit sum is zero. The database enforces this with a deferred constraint and controlled atomic posting functions. Draft and void transactions do not affect derived balances.

Income debits the destination asset and credits a hidden income account. Expense credits the paying asset and debits a hidden expense account. An asset-to-asset transfer changes account location only: it is neither income nor spending. An investment contribution is therefore a transfer, not an expense.

Principal paid from cash to a liability debits the liability and credits cash. Both cash and outstanding debt fall by the same amount, leaving net worth unchanged. Future interest or fees require separate expense entries.

Opening asset/liability balances balance against hidden opening equity, never income. A posted correction is an equal-and-opposite reversal; the original remains auditable.

## Dates and time

Planned financial events use date-only `YYYY-MM-DD` values. User configuration owns the IANA timezone. Pure calculations receive an explicit `asOfDate`; they never infer “today” from the browser clock. Audit and sync timestamps remain instants.

## Forecasting and read models

Forecasts are derived from normalized transactions, recurring rules, and explicitly active scenarios. Screens consume read models for overview, cash flow, funds, and charts. A chart is presentation, never a source of financial calculations.

## Reconciliation, funds, and investments

A balance snapshot is an observation. Reconciliation computes `observed - ledger`; any accepted difference must later become an explicit adjustment transaction rather than a balance overwrite.

Future fund allocations are conceptual ownership labels and must remain net-worth neutral. A physical transfer and fund allocation will be separate facts, preventing double counting. Investment accounts already use subtype `investment`; contributions are neutral transfers. Holdings and market-value snapshots remain out of Phase 2.
