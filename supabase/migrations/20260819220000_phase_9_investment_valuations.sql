begin;

create type public.runway_portfolio_value_source as enum ('manual', 'imported', 'broker');

create table public.portfolio_value_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  value_minor bigint not null check (value_minor >= 0),
  valued_at timestamptz not null,
  source public.runway_portfolio_value_source not null default 'manual',
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete restrict
);

create index portfolio_value_snapshots_owner_account_valued_idx
  on public.portfolio_value_snapshots (user_id, account_id, valued_at desc, created_at desc);

create function runway_private.validate_portfolio_value_snapshot_account()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.accounts a
    where a.id = new.account_id
      and a.user_id = new.user_id
      and a.class = 'asset'
      and a.subtype = 'investment'
      and a.archived_at is null
  ) then
    raise exception 'portfolio value snapshots require an active investment asset account';
  end if;
  return new;
end;
$$;

create trigger portfolio_value_snapshots_validate_account
before insert or update of user_id, account_id on public.portfolio_value_snapshots
for each row execute function runway_private.validate_portfolio_value_snapshot_account();

create trigger portfolio_value_snapshots_set_updated_at
before update on public.portfolio_value_snapshots
for each row execute function runway_private.set_updated_at();

alter table public.portfolio_value_snapshots enable row level security;

create policy portfolio_value_snapshots_select_own on public.portfolio_value_snapshots
for select using ((select auth.uid()) = user_id);
create policy portfolio_value_snapshots_insert_own on public.portfolio_value_snapshots
for insert with check ((select auth.uid()) = user_id);
create policy portfolio_value_snapshots_update_own on public.portfolio_value_snapshots
for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy portfolio_value_snapshots_delete_own on public.portfolio_value_snapshots
for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.portfolio_value_snapshots to authenticated;
revoke all on public.portfolio_value_snapshots from anon;

create or replace view public.current_net_worth
with (security_invoker = true)
as
select
  p.user_id,
  p.base_currency as currency,
  coalesce(sum(case when a.class = 'asset' then
    case when a.subtype = 'investment' then coalesce(latest.value_minor, ab.display_balance_minor, 0)
      else coalesce(ab.display_balance_minor, 0) end else 0 end), 0)::bigint as total_assets_minor,
  coalesce(sum(case when a.class = 'liability' then coalesce(ab.display_balance_minor, 0) else 0 end), 0)::bigint as total_liabilities_minor,
  (coalesce(sum(case when a.class = 'asset' then
    case when a.subtype = 'investment' then coalesce(latest.value_minor, ab.display_balance_minor, 0)
      else coalesce(ab.display_balance_minor, 0) end else 0 end), 0)
   - coalesce(sum(case when a.class = 'liability' then coalesce(ab.display_balance_minor, 0) else 0 end), 0))::bigint as net_worth_minor
from public.profiles p
left join public.accounts a
  on a.user_id = p.user_id
 and a.include_in_net_worth = true
 and a.is_system = false
 and a.archived_at is null
left join public.account_balances ab on ab.account_id = a.id and ab.user_id = a.user_id
left join lateral (
  select s.value_minor, s.valued_at
  from public.portfolio_value_snapshots s
  where s.user_id = a.user_id and s.account_id = a.id
  order by s.valued_at desc, s.created_at desc, s.id desc
  limit 1
) latest on true
group by p.user_id, p.base_currency;

grant select on public.current_net_worth to authenticated;
revoke all on public.current_net_worth from anon;

comment on table public.portfolio_value_snapshots is
  'Non-ledger market valuations for investment accounts. Manual snapshots never create or mutate ledger transactions.';
comment on view public.current_net_worth is
  'Current net worth with the latest investment snapshot replacing that account book balance; ledger book value is the fallback.';

commit;
