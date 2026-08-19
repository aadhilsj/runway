# Forecast and recurrence semantics

## Forecast truth boundary

The Phase 5 forecast is a pure, deterministic projection. Its opening position is the current normalized `account_balances` read model. It then applies expected one-off items, dynamically expanded recurrence, and explicitly selected scenarios through a requested end date. It never posts ledger rows or mutates actual balances.

Posted transactions after the as-of date are excluded by policy in Phase 5. The forecast is not a second ledger. A future extension may add an explicit actual-transaction policy, but it must not silently mix actual and planned effects.

Income increases its destination asset. Expense decreases its source asset. Transfer moves value between two accounts. Investment contributions and principal payments are transfers and remain net-worth neutral. The projection reports Operating Cash, total liquid cash, assets, liabilities, and net worth separately.

The default same-day order is expense, income, then transfer. An explicit `default_sort_order` overrides that policy. Lowest-balance and floor-breach calculations consider only the selected horizon. Overdue expected one-offs are excluded from forward totals and shown in Needs attention.

## Dates and horizon

Planned schedules use `YYYY-MM-DD` calendar dates in the profile's IANA timezone. The domain engine receives an explicit as-of date and never uses browser locale for schedule arithmetic. Monthly dates clamp to the last valid day: a rule for the 31st runs on February 28 or 29 and April 30. Weekly and yearly rules observe their start, optional end, and interval boundaries.

The screen supports 6, 12, 18, and 24 month horizons and persists the selected month count to the profile. Events outside the end date cannot affect totals, lowest points, or charts.

## Recurrence

`recurring_rules` stores editable weekly, monthly, or yearly intent. It does not store infinite generated events. `recurring_occurrences` is sparse and exists only for a skip, date/amount override, or actual match. The stable logical identity is the rule ID plus canonical occurrence date; an override changes presentation, not identity.

Pausing a rule stops expansion without deleting it. Archiving removes it from active configuration. A finite `end_on` remains finite. Irregular months use generic skips, overrides, or one-off replacement items; there is no salary-specific or country-specific calculation.

The preserved legacy finite template covered October 2026 through January 2027. All seven monthly components were already materialized as concrete one-off forecast items for that complete range. Phase 5 therefore creates no legacy recurring rules: beginning recurrence inside the range would duplicate plans, while beginning after January would incorrectly continue a finite template. The reference and all concrete items remain preserved.

## Actual versus planned matching

Actual posted transactions are authoritative. Manual matching marks a planned item or occurrence matched and snapshots its expected amount and expected date. The actual amount/date stay on the transaction, making variance derivable without overwriting the expectation. Matching RPCs require the same authenticated owner, a posted transaction, and a transaction that is not already matched to another planned source.

Matching an occurrence never edits the future rule. Unmatching a one-off restores expected status while retaining audit snapshots. Automatic matching and automatic posting are intentionally outside Phase 5.

## Scenarios and confidence

Base records are immutable forecast inputs. Selected scenario items are overlaid in memory. Multiple compatible scenarios combine; conflicting modifications of the same base source are reported and excluded instead of applying an arbitrary winner. Confidence is explicit (`committed`, `expected`, or `tentative`) and is never probability-weighted.

Phase 7 presents scenarios as Plans and expands overlays to typed assumptions across recurring rules, Funds, Goals, Payday Plan inputs, operating floor, and safety window. Effective dates split derived recurrence in memory without editing canonical rules. Comparison continues to use this forecast engine; there is no scenario-specific forecast formula. See [Plans and scenario comparison](./PLANS_AND_COMPARISON.md).
