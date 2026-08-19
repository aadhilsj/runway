# Database security and write paths

## Ownership and RLS

Every Phase 2 table in `public` has RLS enabled and indexes `user_id` through a primary, unique, or query index. Policies use `(select auth.uid()) = user_id` and target `authenticated`. Composite foreign keys include `user_id`, so a transaction entry, category parent, reversal, or snapshot cannot reference another user's row even if a caller supplies a valid UUID.

The aggregate views use `security_invoker = true`, which preserves underlying RLS. They are read-only for `authenticated` and unavailable to `anon`.

## Allowed browser operations

| Object | Direct authenticated access |
| --- | --- |
| `profiles` | select, insert, update own row |
| `accounts` | select; update own non-system metadata/archive state |
| `categories` | select, insert, update own non-system rows |
| `transactions` | select only |
| `transaction_entries` | select only |
| `account_balance_snapshots` | select and insert owned observations |
| balance/net-worth views | select only |

Account creation and all posted financial writes use RPCs. Direct insert/update/delete privileges are absent from posted transaction and entry tables.

## RPC boundary

Public RPC wrappers are `SECURITY INVOKER`. They call narrowly granted implementations in the unexposed `runway_private` schema. The implementations require `auth.uid()`, use an empty search path, schema-qualify every relation, validate ownership/currency/categories, and post transaction header plus entries atomically.

Available commands are `create_account`, `post_transaction`, `post_income`, `post_expense`, `post_transfer`, `post_debt_payment`, `post_opening_balance`, and `reverse_transaction`. `anon` cannot execute them.

Idempotency is unique per `(user_id, idempotency_key)`. An identical retry returns the original ID; reuse with different payload is rejected. Posted headers and entries are immutable, and unbalanced posting is rejected by both RPC validation and a deferred database constraint.

## Legacy isolation

The Phase 2 migrations do not select from, update, or otherwise depend on `public.runway_state`. Legacy RLS and deployment behavior remain unchanged.
