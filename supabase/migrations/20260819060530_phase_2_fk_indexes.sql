-- Composite indexes cover ownership foreign keys in their declared column order (remote migration version 20260819060530).
drop index public.categories_parent_id_idx;
create index categories_parent_owner_idx on public.categories (parent_id, user_id) where parent_id is not null;

drop index public.transactions_reverses_idx;
create index transactions_reversal_owner_idx on public.transactions (reverses_transaction_id, user_id)
  where reverses_transaction_id is not null;

drop index public.transaction_entries_transaction_idx;
drop index public.transaction_entries_account_idx;
drop index public.transaction_entries_category_idx;
create index transaction_entries_transaction_owner_idx on public.transaction_entries (transaction_id, user_id);
create index transaction_entries_account_owner_idx on public.transaction_entries (account_id, user_id, transaction_id);
create index transaction_entries_category_owner_idx on public.transaction_entries (category_id, user_id)
  where category_id is not null;

drop index public.account_snapshots_account_observed_idx;
drop index public.account_snapshots_reconciliation_idx;
create index account_snapshots_account_owner_observed_idx
  on public.account_balance_snapshots (account_id, user_id, observed_at desc);
create index account_snapshots_reconciliation_owner_idx
  on public.account_balance_snapshots (reconciliation_transaction_id, user_id)
  where reconciliation_transaction_id is not null;
