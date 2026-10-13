# Investments V1

Phase 9 treats an investment account as an ordinary `asset / investment` ledger account with a separate manual market-valuation history.

## Accounting boundaries

- Contributions and withdrawals are posted double-entry `transfer` transactions. They affect account book balances but are not income or spending.
- Investment-to-investment transfers do not change aggregate contributed principal.
- Opening investment balances establish opening principal. Net external contributions and withdrawals change it afterward; displayed principal is never negative.
- `portfolio_value_snapshots` store observations only. Creating, editing, or deleting a valuation never creates, edits, or reverses a ledger transaction.
- Current market value is the latest snapshot by `valued_at`, then `created_at`, then ID. With no snapshot, the ledger book balance is used.
- Gain/loss is current market value minus net contributed principal. It is neither tax cost basis nor broker time-weighted performance.

## Net worth and forecast

Current net worth replaces an investment account's book value with its latest market value exactly once. Historical net-worth charts carry each recorded valuation adjustment forward until a newer snapshot; no values are fabricated before cutover.

The forecast engine starts investment accounts at the latest recorded value and assumes 0% market return. Future ledger contributions and withdrawals still affect the projected account. Operating cash and safe-to-spend remain unchanged by a valuation snapshot.

## Security and corrections

RLS limits snapshots to their owner. A database trigger rejects non-investment, archived, or cross-owner account targets. V1 accepts manual values only in the browser; the enum leaves explicit future sources for importer or broker integrations. Corrections are explicit edits/deletes with `updated_at`; ledger truth remains untouched.

No holdings, securities, prices, currencies, dividends, tax lots, fees, benchmark returns, or broker sync are modeled in V1.
