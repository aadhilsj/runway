-- Runway 2 Phase 6.1: close the initial October budget and retire stale migration code.
-- This migration never reads or writes public.runway_state and creates no ledger activity.

-- The remaining NOK 500 is classified inside the existing Groceries + Misc ceiling.
-- Keeping a single group line avoids overlapping it with a direct Miscellaneous line.
update public.budget_lines l
set budgeted_minor = 550000,
    notes = 'Combined conservative ceiling: NOK 5,000 base plus NOK 500 classified as Miscellaneous; not a spending target.'
from public.budget_periods p, public.budget_groups g
where l.budget_period_id = p.id
  and l.user_id = p.user_id
  and l.group_id = g.id
  and l.user_id = g.user_id
  and p.month_start = date '2026-10-01'
  and p.currency = 'NOK'
  and g.name = 'Groceries + Misc'
  and l.budgeted_minor = 500000;

-- Phase 4 was a one-time, already-applied production cutover. Its audit trail remains
-- in runway_migration.application_records and migration_runs; the executable is retired
-- so its stale Phase 4 type references cannot be invoked or flagged by database lint.
revoke all on function runway_migration.apply_phase4_cutover(uuid,text,text,text,timestamptz,uuid,date)
  from public, anon, authenticated, service_role;
drop function runway_migration.apply_phase4_cutover(uuid,text,text,text,timestamptz,uuid,date);

-- Preserve Phase 5 matching behavior while removing variables that were populated but
-- never read. PERFORM retains the same owned-row validation and row-lock semantics.
create or replace function public.match_forecast_item(p_forecast_item_id uuid, p_transaction_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  perform 1 from public.forecast_items where id=p_forecast_item_id and user_id=v_user_id for update;
  if not found then raise exception using errcode='P0002', message='Forecast item not found'; end if;
  perform 1 from public.transactions where id=p_transaction_id and user_id=v_user_id and status='posted' for update;
  if not found then raise exception using errcode='22023', message='A posted owned transaction is required'; end if;
  if exists (select 1 from public.forecast_items where user_id=v_user_id and matched_transaction_id=p_transaction_id and id<>p_forecast_item_id)
    or exists (select 1 from public.recurring_occurrences where user_id=v_user_id and matched_transaction_id=p_transaction_id)
  then raise exception using errcode='23505', message='Transaction is already matched'; end if;
  update public.forecast_items set status='matched', matched_transaction_id=p_transaction_id,
    expected_amount_minor_snapshot=amount_minor, expected_date_snapshot=expected_date where id=p_forecast_item_id;
end $$;

create or replace function public.match_recurring_occurrence(p_recurring_rule_id uuid, p_occurrence_date date, p_transaction_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := (select auth.uid()); v_rule public.recurring_rules%rowtype;
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
