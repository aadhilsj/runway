create type public.runway_planned_kind as enum ('income', 'expense', 'transfer');
create type public.runway_planned_status as enum ('expected', 'skipped', 'canceled', 'matched');
create type public.runway_planned_confidence as enum ('committed', 'expected', 'tentative');
create type public.runway_recurrence_frequency as enum ('weekly', 'monthly', 'yearly');
create type public.runway_occurrence_status as enum ('expected', 'skipped', 'overridden', 'matched');

alter table public.forecast_items drop constraint forecast_items_account_shape;
alter table public.forecast_items alter column confidence drop default;
alter table public.forecast_items alter column status drop default;
alter table public.forecast_items
  alter column kind type public.runway_planned_kind using kind::text::public.runway_planned_kind,
  alter column confidence type public.runway_planned_confidence using
    (case confidence::text when 'high' then 'committed' when 'low' then 'tentative' else 'expected' end)::public.runway_planned_confidence,
  alter column status type public.runway_planned_status using
    (case status::text when 'realized' then 'matched' else status::text end)::public.runway_planned_status;
alter table public.forecast_items
  alter column confidence set default 'expected',
  alter column status set default 'expected',
  add column default_sort_order integer,
  add column matched_transaction_id uuid,
  add column expected_amount_minor_snapshot bigint,
  add column expected_date_snapshot date,
  add constraint forecast_items_matched_transaction_owner_fkey foreign key (matched_transaction_id, user_id)
    references public.transactions (id, user_id) on delete restrict,
  add constraint forecast_items_match_shape check (
    (status = 'matched' and matched_transaction_id is not null and expected_amount_minor_snapshot is not null and expected_date_snapshot is not null)
    or (status <> 'matched' and matched_transaction_id is null)
  ),
  add constraint forecast_items_account_shape check (
    (kind = 'income' and source_account_id is null and destination_account_id is not null)
    or (kind = 'expense' and source_account_id is not null and destination_account_id is null)
    or (kind = 'transfer' and source_account_id is not null and destination_account_id is not null and source_account_id <> destination_account_id)
  );
create unique index forecast_items_matched_transaction_uidx on public.forecast_items (user_id, matched_transaction_id)
  where matched_transaction_id is not null;
create index forecast_items_matched_transaction_owner_idx on public.forecast_items (matched_transaction_id, user_id)
  where matched_transaction_id is not null;

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.runway_planned_kind not null,
  label text not null,
  notes text,
  source_account_id uuid,
  destination_account_id uuid,
  category_id uuid,
  amount_minor bigint not null check (amount_minor > 0),
  frequency public.runway_recurrence_frequency not null,
  interval_count integer not null default 1 check (interval_count between 1 and 120),
  day_of_month integer check (day_of_month between 1 and 31),
  day_of_week integer check (day_of_week between 0 and 6),
  start_on date not null,
  end_on date,
  default_sort_order integer,
  confidence public.runway_planned_confidence not null default 'expected',
  scenario_id uuid,
  active boolean not null default true,
  is_reliable_income boolean not null default false,
  legacy_source_id text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  archived_at timestamptz,
  constraint recurring_rules_id_user_unique unique (id, user_id),
  constraint recurring_rules_legacy_source_unique unique (user_id, legacy_source_id),
  constraint recurring_rules_source_account_owner_fkey foreign key (source_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  constraint recurring_rules_destination_account_owner_fkey foreign key (destination_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  constraint recurring_rules_category_owner_fkey foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  constraint recurring_rules_scenario_owner_fkey foreign key (scenario_id, user_id) references public.scenarios (id, user_id) on delete restrict,
  constraint recurring_rules_label_length check (char_length(btrim(label)) between 1 and 240),
  constraint recurring_rules_notes_length check (notes is null or char_length(notes) <= 4000),
  constraint recurring_rules_dates check (end_on is null or end_on >= start_on),
  constraint recurring_rules_schedule_shape check (
    (frequency = 'weekly' and day_of_week is not null and day_of_month is null)
    or (frequency in ('monthly', 'yearly') and day_of_month is not null and day_of_week is null)
  ),
  constraint recurring_rules_account_shape check (
    (kind = 'income' and source_account_id is null and destination_account_id is not null)
    or (kind = 'expense' and source_account_id is not null and destination_account_id is null)
    or (kind = 'transfer' and source_account_id is not null and destination_account_id is not null and source_account_id <> destination_account_id)
  ),
  constraint recurring_rules_reliable_income_shape check (not is_reliable_income or kind = 'income')
);

create table public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recurring_rule_id uuid not null,
  occurrence_date date not null,
  status public.runway_occurrence_status not null,
  override_date date,
  override_amount_minor bigint check (override_amount_minor > 0),
  matched_transaction_id uuid,
  expected_amount_minor_snapshot bigint,
  expected_date_snapshot date,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint recurring_occurrences_rule_date_unique unique (recurring_rule_id, occurrence_date),
  constraint recurring_occurrences_rule_owner_fkey foreign key (recurring_rule_id, user_id) references public.recurring_rules (id, user_id) on delete cascade,
  constraint recurring_occurrences_transaction_owner_fkey foreign key (matched_transaction_id, user_id) references public.transactions (id, user_id) on delete restrict,
  constraint recurring_occurrences_shape check (
    (status = 'expected' and override_date is null and override_amount_minor is null and matched_transaction_id is null)
    or (status = 'skipped' and matched_transaction_id is null)
    or (status = 'overridden' and matched_transaction_id is null and (override_date is not null or override_amount_minor is not null))
    or (status = 'matched' and matched_transaction_id is not null and expected_amount_minor_snapshot is not null and expected_date_snapshot is not null)
  )
);
create unique index recurring_occurrences_matched_transaction_uidx on public.recurring_occurrences (user_id, matched_transaction_id)
  where matched_transaction_id is not null;
create index recurring_rules_user_active_idx on public.recurring_rules (user_id, start_on) where archived_at is null;
create index recurring_rules_source_account_owner_idx on public.recurring_rules (source_account_id, user_id) where source_account_id is not null;
create index recurring_rules_destination_account_owner_idx on public.recurring_rules (destination_account_id, user_id) where destination_account_id is not null;
create index recurring_rules_category_owner_idx on public.recurring_rules (category_id, user_id) where category_id is not null;
create index recurring_rules_scenario_owner_idx on public.recurring_rules (scenario_id, user_id) where scenario_id is not null;
create index recurring_occurrences_user_rule_idx on public.recurring_occurrences (user_id, recurring_rule_id, occurrence_date);
create index recurring_occurrences_transaction_owner_idx on public.recurring_occurrences (matched_transaction_id, user_id) where matched_transaction_id is not null;

create trigger recurring_rules_set_updated_at before update on public.recurring_rules for each row execute function runway_private.set_updated_at();
create trigger recurring_occurrences_set_updated_at before update on public.recurring_occurrences for each row execute function runway_private.set_updated_at();
alter table public.recurring_rules enable row level security;
alter table public.recurring_occurrences enable row level security;
create policy recurring_rules_select_own on public.recurring_rules for select to authenticated using ((select auth.uid()) = user_id);
create policy recurring_rules_insert_own on public.recurring_rules for insert to authenticated with check ((select auth.uid()) = user_id and legacy_source_id is null);
create policy recurring_rules_update_own on public.recurring_rules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy recurring_rules_delete_own on public.recurring_rules for delete to authenticated using ((select auth.uid()) = user_id and legacy_source_id is null);
create policy recurring_occurrences_select_own on public.recurring_occurrences for select to authenticated using ((select auth.uid()) = user_id);
create policy recurring_occurrences_insert_own on public.recurring_occurrences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy recurring_occurrences_update_own on public.recurring_occurrences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy recurring_occurrences_delete_own on public.recurring_occurrences for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.recurring_rules, public.recurring_occurrences from anon, authenticated;
grant select, insert, update, delete on public.recurring_rules, public.recurring_occurrences to authenticated;

create function public.match_forecast_item(p_forecast_item_id uuid, p_transaction_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := (select auth.uid()); v_item public.forecast_items%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  select * into v_item from public.forecast_items where id=p_forecast_item_id and user_id=v_user_id for update;
  if not found then raise exception using errcode='P0002', message='Forecast item not found'; end if;
  perform 1 from public.transactions where id=p_transaction_id and user_id=v_user_id and status='posted' for update;
  if not found then raise exception using errcode='22023', message='A posted owned transaction is required'; end if;
  if exists (select 1 from public.forecast_items where user_id=v_user_id and matched_transaction_id=p_transaction_id and id<>p_forecast_item_id)
    or exists (select 1 from public.recurring_occurrences where user_id=v_user_id and matched_transaction_id=p_transaction_id)
  then raise exception using errcode='23505', message='Transaction is already matched'; end if;
  update public.forecast_items set status='matched', matched_transaction_id=p_transaction_id,
    expected_amount_minor_snapshot=amount_minor, expected_date_snapshot=expected_date where id=p_forecast_item_id;
end $$;

create function public.unmatch_forecast_item(p_forecast_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  update public.forecast_items set status='expected', matched_transaction_id=null where id=p_forecast_item_id and user_id=v_user_id and status='matched';
  if not found then raise exception using errcode='P0002', message='Matched forecast item not found'; end if;
end $$;

create function public.match_recurring_occurrence(p_recurring_rule_id uuid, p_occurrence_date date, p_transaction_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := (select auth.uid()); v_rule public.recurring_rules%rowtype; v_occurrence public.recurring_occurrences%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  select * into v_rule from public.recurring_rules where id=p_recurring_rule_id and user_id=v_user_id for update;
  if not found then raise exception using errcode='P0002', message='Recurring rule not found'; end if;
  perform 1 from public.transactions where id=p_transaction_id and user_id=v_user_id and status='posted' for update;
  if not found then raise exception using errcode='22023', message='A posted owned transaction is required'; end if;
  if exists (select 1 from public.forecast_items where user_id=v_user_id and matched_transaction_id=p_transaction_id)
    or exists (select 1 from public.recurring_occurrences where user_id=v_user_id and matched_transaction_id=p_transaction_id)
  then raise exception using errcode='23505', message='Transaction is already matched'; end if;
  insert into public.recurring_occurrences (user_id, recurring_rule_id, occurrence_date, status, matched_transaction_id, expected_amount_minor_snapshot, expected_date_snapshot)
  values (v_user_id, p_recurring_rule_id, p_occurrence_date, 'matched', p_transaction_id, v_rule.amount_minor, p_occurrence_date)
  on conflict (recurring_rule_id, occurrence_date) do update set status='matched', matched_transaction_id=excluded.matched_transaction_id,
    expected_amount_minor_snapshot=coalesce(public.recurring_occurrences.override_amount_minor, v_rule.amount_minor),
    expected_date_snapshot=coalesce(public.recurring_occurrences.override_date, p_occurrence_date), override_amount_minor=null, override_date=null;
end $$;
revoke all on function public.match_forecast_item(uuid,uuid), public.unmatch_forecast_item(uuid), public.match_recurring_occurrence(uuid,date,uuid) from public, anon;
grant execute on function public.match_forecast_item(uuid,uuid), public.unmatch_forecast_item(uuid), public.match_recurring_occurrence(uuid,date,uuid) to authenticated;

update public.profiles set forecast_horizon_months=coalesce(forecast_horizon_months, 12), schema_version=5;

drop type public.runway_forecast_kind;
drop type public.runway_forecast_status;
drop type public.runway_forecast_confidence;
