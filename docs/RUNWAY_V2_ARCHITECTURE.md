# Runway 2 architecture

Runway 2 is an isolated React Router Framework Mode SPA in `runway-v2/`. Phase 4 established the active owner's normalized opening state while the root legacy application remains deployed and operational.

## Boundaries

- `app/domain/` contains pure TypeScript. It must not import React, Supabase, Recharts, browser globals, or route modules.
- `app/data/` owns Supabase and TanStack Query integration. The schema-synchronized database interface lives in `app/data/database.types.ts`.
- `app/read-models/` defines screen-shaped projections. Charts receive read-model data; they do not calculate financial truth.
- `app/auth/` restores the Supabase session and exposes the minimum auth state/actions.
- `app/routes/` composes page modules. Remote server state belongs in TanStack Query; ephemeral controls stay local; shareable filters belong in the URL.
- `app/components/` and `app/styles/` implement the shell and tokens without a UI framework.

## Runtime flow

The root creates one QueryClient, restores the Supabase session, then allows the protected layout to render. `/` redirects to `/overview`; `/money` redirects to `/money/transactions`. Financial routes redirect unauthenticated users to `/sign-in` and preserve the intended destination.

No route reads `public.runway_state`. Accounts and Transactions read the normalized ledger; Forecast reads non-authoritative planning tables and ledger-derived actual balances. This keeps legacy state out of the runtime truth path after the approved Phase 4 application.

## Phase 2 ledger boundary

The normalized model uses user-facing typed transactions over a lightweight double-entry ledger:

- `accounts` represents real asset/liability accounts and hidden income, expense, opening-equity, and adjustment accounts.
- `transactions` stores intent, lifecycle, provenance, idempotency, and reversal relationships.
- `transaction_entries` stores signed account impacts. Posted entries must sum to zero.
- `account_balances` derives current balances from posted entries; there is no mutable current-balance column.
- `current_net_worth` includes owned, non-system asset balances minus liability balances.
- `account_balance_snapshots` records observations without rewriting ledger history.

Positive entries are debits and negative entries are credits. Display balance equals raw ledger balance for asset/expense accounts and its negation for liability/income/equity accounts. This conversion lives in the domain layer and database read model, not UI components.

Posted transactions remain `posted` forever. Corrections create an equal-and-opposite posted transaction linked through `reverses_transaction_id`. `void` is reserved for unposted drafts; it is not a substitute for reversal.

## Phase 4 actual/planned boundary

- The opening balance is the sole authoritative imported ledger value. Legacy settled history is never replayed on top of it.
- Income, expense, transfer, debt-payment, opening-balance, reversal, and confirmed reconciliation workflows use database RPCs and ledger-derived balances.
- Bank observations create immutable snapshots. A balance difference changes the ledger only after explicit adjustment confirmation.
- Future migrated events live in `forecast_items`; settled events, overdue resolutions, old templates, lineage hints, and old budget data live in reference tables.
- Phase 4 does not implement projection calculations, Funds, allocation rules, or automatic forecast posting.

## Phase 5 forecast boundary

- `app/domain/forecast.ts` expands recurrence and calculates projections without React, Supabase, or chart dependencies.
- `recurring_rules` stores finite or open-ended schedule intent; `recurring_occurrences` stores only exceptions and matches.
- `app/read-models/forecast.ts` maps normalized rows into typed engine input and screen-shaped output.
- `/forecast` selects horizon/scenarios and renders summaries, chart series, attention items, and a dense timeline. `/settings/recurring` edits schedule configuration.
- Matching links planned expectations to authoritative posted transactions through guarded RPCs. It preserves expected snapshots and never changes the ledger or future rule.
- The fully materialized finite legacy template remains concrete one-off items; no duplicate recurring rules are created.

## State ownership

- Supabase: authenticated durable normalized ledger data.
- TanStack Query: remote cache and mutations.
- URL search parameters: filters, ranges, and selected scenario IDs that should survive refresh/share.
- Component state: menus, focus, disclosure, draft interaction.
- React Hook Form + Zod: form state and validation.

Global client stores are intentionally absent.
