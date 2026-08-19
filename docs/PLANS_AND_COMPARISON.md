# Plans and scenario comparison

## Base Plan

Base Plan is not a scenario row. It is the canonical combination of current ledger-derived balances, Base forecast items, recurring rules, Funds and Goals, Payday Plan, budgets, operating floor, and safety window. A comparison always calculates Base first and overlays selected Plans onto cloned engine input.

Plans never store calculated timelines or balances. `scenarios` stores Plan identity and lifecycle; `scenario_changes` stores typed assumptions with owned target foreign keys, amounts, effective dates, schedule fields, and a small validated metadata object. Existing migrated scenarios remain compatibility Plans: their scenario-linked forecast items keep their original meaning and are not rewritten into invented changes.

## Overlay and conflicts

`app/domain/scenarios.ts` is pure TypeScript with no React or Supabase dependency. It applies assumptions to derived forecast, allocation, Goal, floor, and safety-window input, then delegates calculations to the Phase 5 forecast engine and Phase 6 allocation and safe-to-spend engines.

Multiple Plans are sorted deterministically. Changes to separate targets combine. Changes to the same target conflict when their effective periods overlap; suppress-versus-modify also conflicts. Conflicting changes are reported and omitted rather than resolved by selection order. Non-overlapping periods may safely modify the same recurring rule.

A Fund-funded Plan expense creates one projected external expense and one virtual Fund reduction. The Fund action does not affect cash or net worth, so wealth falls exactly once. Future Fund allocations remain virtual earmarks and use the normal Phase 6 recommendation engine.

## Comparison

`/plans/compare` limits comparison to Base, two individual Plans, and their combined result. The read model reports ending Operating Cash, liquid cash, net worth, lowest Operating Cash, safe-to-spend, income, expenses, Fund balances, Goal completion within the requested horizon, and floor breaches. Health labels are neutral observations such as “No floor breach,” “Operating floor breached,” and “Fund depleted.” Results are memory-only and are never written to Supabase.

## Apply to Base

Apply promotes assumptions, never forecast results. The detail screen first requests `preview_plan_application`, which returns the exact assumptions, a fingerprinted confirmation token, and an explicit zero-actual-transaction declaration. Any edit makes the token stale.

`apply_plan_to_base` locks the owned Plan, validates the fresh token and every owned target, and applies supported canonical configuration changes in one database transaction. Failure rolls back the entire application. An application record makes repeat calls idempotent. Supported mappings include one-off forecast items, whole-rule recurring edits or pauses, temporary recurring rules, Payday Plan item changes, Goal thresholds, operating floor, safety window, and income reliability. Dated recurring modifications that need rule splitting are deliberately rejected for manual Base review rather than partially promoted.

Successful application archives the Plan as an applied reference. It cannot create actual transactions, post expenses, move Fund money, or execute the Payday Plan.
