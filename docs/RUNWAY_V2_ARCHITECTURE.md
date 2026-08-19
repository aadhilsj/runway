# Runway 2 architecture

Runway 2 is an isolated React Router Framework Mode SPA in `runway-v2/`. The root legacy files remain the deployable application until a separately approved cutover.

## Boundaries

- `app/domain/` contains pure TypeScript. It must not import React, Supabase, Recharts, browser globals, or route modules.
- `app/data/` owns Supabase and TanStack Query integration. Generated database types live in `app/data/database.types.ts` and are regenerated from the linked project, never hand-edited.
- `app/read-models/` defines screen-shaped projections. Charts receive read-model data; they do not calculate financial truth.
- `app/auth/` restores the Supabase session and exposes the minimum auth state/actions.
- `app/routes/` composes page modules. Remote server state belongs in TanStack Query; ephemeral controls stay local; shareable filters belong in the URL.
- `app/components/` and `app/styles/` implement the shell and tokens without a UI framework.

## Runtime flow

The root creates one QueryClient, restores the Supabase session, then allows the protected layout to render. `/` redirects to `/overview`; `/money` redirects to `/money/transactions`. Financial routes redirect unauthenticated users to `/sign-in` and preserve the intended destination.

No route reads `public.runway_state`. This prevents accidental coupling to the blob while Phase 3 migration remains unapproved.

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

## State ownership

- Supabase: authenticated durable normalized ledger data.
- TanStack Query: remote cache and mutations.
- URL search parameters: filters, ranges, and selected scenario IDs that should survive refresh/share.
- Component state: menus, focus, disclosure, draft interaction.
- React Hook Form + Zod: form state and validation.

Global client stores are intentionally absent.
