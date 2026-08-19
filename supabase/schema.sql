create extension if not exists "pgcrypto";

create table if not exists public.runway_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.runway_state enable row level security;

drop policy if exists "runway_state_select_own" on public.runway_state;
create policy "runway_state_select_own"
on public.runway_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "runway_state_insert_own" on public.runway_state;
create policy "runway_state_insert_own"
on public.runway_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "runway_state_update_own" on public.runway_state;
create policy "runway_state_update_own"
on public.runway_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.runway_state from anon;
grant select, insert, update on public.runway_state to authenticated;
