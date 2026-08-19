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
drop policy if exists "runway_state_update_own" on public.runway_state;

revoke all on public.runway_state from anon;
revoke all privileges on public.runway_state from authenticated;
grant select on public.runway_state to authenticated;
