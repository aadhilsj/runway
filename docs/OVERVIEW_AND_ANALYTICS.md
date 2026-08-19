# Overview and analytics

Phase 8 composes existing authoritative and planning read models; it is not a second finance engine.

## Headline semantics

- **Total cash** is the displayed balance of owned, non-system operating and liquid asset accounts.
- **Allocated cash** is the sum of current virtual Fund balances. It is a purpose label over cash, never another asset.
- **Unallocated cash** is total eligible cash minus allocated cash.
- **Net worth** is included asset balances minus displayed liability balances. Investments remain at ledger book value until Phase 9.
- **Safe-to-spend** is calculated by the Phase 6 safety-window and operating-floor implementation.
- **Monthly net cash flow** is posted ledger income minus posted ledger expense. Opening balances, transfers, debt principal and Fund allocations are excluded.

## Actual analytics

Cash flow and category spending use entries in the system income and expense accounts. Refunds, reimbursements and reversals reduce the corresponding totals through their reversing ledger entries. Internal and investment transfers do not enter external cash flow.

Historical net worth and cash are reconstructed from posted entries affecting included, non-system asset and liability accounts. Transfers are neutral. The series begins with the first authoritative Runway 2 ledger transaction; no pre-cutover values are fabricated or visually blended with legacy reference history.

Budgets retain Phase 6 definitions: remaining is budget minus actual; uncommitted is budget minus actual minus committed forecast spending. Missing months are not synthesized.

## Actual and projected boundary

Actual charts are labeled `Actual` and use solid marks. Overview forecast data is labeled `Projected`, uses the Phase 5 engine, and uses dashed styling. Fund recommendations and safe-to-spend reuse Phase 6. Plan impact reuses Phase 7 comparison output and is never persisted by Overview.

All charts receive prepared typed read models and perform no database queries or financial calculations.
