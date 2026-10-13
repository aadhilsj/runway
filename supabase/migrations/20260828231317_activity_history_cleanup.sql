-- Presentation-only: financial transactions and entries remain immutable.
create table public.activity_history_cleanup (
  user_id uuid not null references auth.users(id),
  original_id uuid primary key references public.transactions(id),
  reversal_id uuid not null unique references public.transactions(id),
  created_at timestamptz not null default now(),
  check (original_id <> reversal_id)
);
create index activity_history_cleanup_user_idx on public.activity_history_cleanup(user_id);
alter table public.activity_history_cleanup enable row level security;
revoke all on public.activity_history_cleanup from anon, authenticated;
grant select, insert on public.activity_history_cleanup to authenticated;
create policy cleanup_read on public.activity_history_cleanup for select to authenticated
  using (user_id = (select auth.uid()));
create policy cleanup_insert on public.activity_history_cleanup for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.transactions original
      join public.transactions reversal on reversal.reverses_transaction_id = original.id
      where original.id = original_id and reversal.id = reversal_id
        and original.user_id = (select auth.uid())
        and reversal.user_id = (select auth.uid())
        and original.status = 'posted' and reversal.status = 'posted'
        and original.reverses_transaction_id is null
    )
  );
