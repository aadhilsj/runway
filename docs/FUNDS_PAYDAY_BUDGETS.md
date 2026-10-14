# Funds, payday planning, and budgets

## Funds and goals

A Fund is a virtual purpose envelope backed by an owned asset account. Its balance is the signed sum of `fund_movements`; it is not a bank-account balance and is never included a second time in net worth. A Goal can define a target, preferred balance, cap, contribution preference, floor, and target date. At most one non-archived primary Goal is allowed per Fund.

Allocation and release change only the virtual split between allocated and unallocated backing cash. Fund-to-Fund transfers create paired movements whose sum is zero. A Fund spend is one atomic command: it posts one ordinary double-entry expense and one negative Fund movement linked to that transaction.

## Payday plan

The default plan is review-first (`recommended`). The pure allocation engine orders active items by priority, clamps contributions at the selected Goal threshold, activates data-driven redirects, and partially funds the last safe item when necessary. Manual items are never recommended. Automatic mode is modeled but requires the same server-side safety and idempotency boundary before execution.

Recommendations are not financial records. Only confirmed fund-destination items create `fund_movements`. Investment/account destinations require a real transfer through the account ledger and are intentionally not fabricated as virtual allocations.

## Safe-to-spend and backing

For the configured safety window:

`safe to spend = max(0, minimum projected operating cash - allocated operating Funds - operating floor)`

Allocated Fund money is subtracted exactly once. `fund_backing_summary` exposes the account balance, total allocated Fund balance, unallocated balance, and an integrity flag. New allocations are rejected if they exceed unallocated backing cash.

## Budgets

Budget periods contain lines targeted at either one category or one category group. Actual spend is derived from posted expense entries less posted refunds/reimbursements. Transfers, opening balances, forecast-only items, and virtual Fund movements are excluded. A reversal counts against the month of the transaction it reverses, not the month the correction was posted, so a corrected expense releases the budget it originally consumed and no phantom negative actual appears in the correction's month. The reversal itself keeps its real `occurred_at`, so balances, net-worth history, and the audit trail still record when the correction happened. Committed spend is reported separately from expected forecast expenses.

The initial October configuration preserves Groceries + Misc as a combined NOK 5,000 group because the source plan does not justify an arbitrary split. Other base October category lines are derived from expected non-scenario forecast inputs and remain editable. The safely classified initial total is NOK 16,038; Runway does not duplicate the normalized Miscellaneous category merely to force the approximate NOK 16,538 planning figure.

## Reimbursement trackers

A tracker covers one occasion rather than one person. "Paddle (Tom, Mina, Sam)" holds everything that evening's group owes; the next outing with different people opens its own tracker instead of reusing it. Several trackers can be active at once, so a shared expense never has to land on an unrelated balance.

`post_split_expense_to_new_pool` opens a tracker as part of logging the expense, in one transaction, so a failed expense cannot leave an orphan tracker and a retried idempotency key returns the original transaction rather than opening a second one. A tracker starts empty and accrues from that expense onward; only `convert_forecast_item_to_reimbursement_pool` carries an opening balance across from an existing forecast item.

Only the personal share reaches the budget. A 600.00 expense with 450.00 owed back posts 600.00 out of cash, 450.00 onto the hidden receivable, and 150.00 as categorized spending. The outstanding amount publishes a forecast transfer, not income, because the money is already counted as an asset owed and merely converts to cash. A tracker is settled when its balance reaches zero: the forecast item is retired automatically and the tracker drops out of the picker while its history stays on file.

## Initial production configuration

Phase 6 creates Emergency, Travel, Home, Family, and Fero Funds with zero balances; corresponding editable Goals; a zero-balance Investments account destination; and an editable recommended Payday plan. It does not allocate the existing Operating Cash balance, post transactions, execute a payday plan, or touch `runway_state`.
