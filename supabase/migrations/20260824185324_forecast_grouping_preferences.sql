-- Persist the user's corrections to the semantic grouping shown on Forecast
-- assumptions. Alias rows decide which group a normalized label belongs to;
-- name rows let that group keep a user-selected display name.

create table public.forecast_group_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.runway_planned_kind not null,
  label_key text not null,
  group_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forecast_group_aliases_income_expense_check check (kind in ('income', 'expense')),
  constraint forecast_group_aliases_label_key_check check (char_length(label_key) between 1 and 160),
  constraint forecast_group_aliases_group_key_check check (char_length(group_key) between 1 and 200),
  constraint forecast_group_aliases_user_kind_label_key_key unique (user_id, kind, label_key)
);

create table public.forecast_group_names (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.runway_planned_kind not null,
  group_key text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forecast_group_names_income_expense_check check (kind in ('income', 'expense')),
  constraint forecast_group_names_group_key_check check (char_length(group_key) between 1 and 200),
  constraint forecast_group_names_display_name_check check (char_length(btrim(display_name)) between 1 and 120),
  constraint forecast_group_names_user_kind_group_key_key unique (user_id, kind, group_key)
);

create index forecast_group_aliases_user_kind_group_idx
  on public.forecast_group_aliases (user_id, kind, group_key);
create index forecast_group_names_user_kind_idx
  on public.forecast_group_names (user_id, kind);

create trigger forecast_group_aliases_set_updated_at
before update on public.forecast_group_aliases
for each row execute function runway_private.set_updated_at();

create trigger forecast_group_names_set_updated_at
before update on public.forecast_group_names
for each row execute function runway_private.set_updated_at();

alter table public.forecast_group_aliases enable row level security;
alter table public.forecast_group_names enable row level security;

create policy forecast_group_aliases_select_own on public.forecast_group_aliases
for select to authenticated using ((select auth.uid()) = user_id);
create policy forecast_group_aliases_insert_own on public.forecast_group_aliases
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy forecast_group_aliases_update_own on public.forecast_group_aliases
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy forecast_group_aliases_delete_own on public.forecast_group_aliases
for delete to authenticated using ((select auth.uid()) = user_id);

create policy forecast_group_names_select_own on public.forecast_group_names
for select to authenticated using ((select auth.uid()) = user_id);
create policy forecast_group_names_insert_own on public.forecast_group_names
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy forecast_group_names_update_own on public.forecast_group_names
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy forecast_group_names_delete_own on public.forecast_group_names
for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.forecast_group_aliases, public.forecast_group_names from anon, authenticated;
grant select, insert, update, delete on public.forecast_group_aliases, public.forecast_group_names to authenticated;
