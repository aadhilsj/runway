create function public.settle_forecast_item(
  p_forecast_item_id uuid,
  p_actual_amount_minor bigint,
  p_occurred_at timestamptz,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_item public.forecast_items%rowtype;
  v_transaction_id uuid;
begin
  if p_actual_amount_minor <= 0 then
    raise exception using errcode = '22023', message = 'Actual amount must be positive';
  end if;

  select * into v_item
  from public.forecast_items
  where id = p_forecast_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Forecast item not found';
  end if;
  v_user_id := v_item.user_id;
  if v_item.status = 'matched' and v_item.matched_transaction_id is not null then
    return v_item.matched_transaction_id;
  end if;
  if v_item.status <> 'expected' then
    raise exception using errcode = '55000', message = 'Only an expected forecast item can be settled';
  end if;
  if v_item.scenario_id is not null then
    raise exception using errcode = '55000', message = 'Apply the Plan to Base before settling this item';
  end if;

  if v_item.kind = 'income' then
    v_transaction_id := runway_private.post_income_impl(
      coalesce(p_destination_account_id, v_item.destination_account_id),
      p_actual_amount_minor,
      coalesce(p_category_id, v_item.category_id),
      p_occurred_at,
      v_item.label,
      v_item.label,
      p_notes,
      p_idempotency_key
    );
  elsif v_item.kind = 'expense' then
    v_transaction_id := runway_private.post_expense_impl(
      coalesce(p_source_account_id, v_item.source_account_id),
      p_actual_amount_minor,
      coalesce(p_category_id, v_item.category_id),
      p_occurred_at,
      v_item.label,
      v_item.label,
      p_notes,
      p_idempotency_key
    );
  else
    v_transaction_id := runway_private.post_transfer_impl(
      coalesce(p_source_account_id, v_item.source_account_id),
      coalesce(p_destination_account_id, v_item.destination_account_id),
      p_actual_amount_minor,
      p_occurred_at,
      v_item.label,
      p_notes,
      p_idempotency_key
    );
  end if;

  update public.forecast_items
  set status = 'matched',
      matched_transaction_id = v_transaction_id,
      expected_amount_minor_snapshot = amount_minor,
      expected_date_snapshot = expected_date
  where id = v_item.id and user_id = v_user_id;

  return v_transaction_id;
end;
$$;

create function public.settle_recurring_occurrence(
  p_recurring_rule_id uuid,
  p_occurrence_date date,
  p_actual_amount_minor bigint,
  p_occurred_at timestamptz,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_rule public.recurring_rules%rowtype;
  v_occurrence public.recurring_occurrences%rowtype;
  v_expected_amount bigint;
  v_expected_date date;
  v_transaction_id uuid;
begin
  if p_actual_amount_minor <= 0 then
    raise exception using errcode = '22023', message = 'Actual amount must be positive';
  end if;

  select * into v_rule
  from public.recurring_rules
  where id = p_recurring_rule_id and archived_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Recurring rule not found';
  end if;
  v_user_id := v_rule.user_id;
  if v_rule.scenario_id is not null then
    raise exception using errcode = '55000', message = 'Apply the Plan to Base before settling this item';
  end if;

  select * into v_occurrence
  from public.recurring_occurrences
  where recurring_rule_id = p_recurring_rule_id
    and occurrence_date = p_occurrence_date
    and user_id = v_user_id
  for update;

  if found and v_occurrence.status = 'matched' and v_occurrence.matched_transaction_id is not null then
    return v_occurrence.matched_transaction_id;
  end if;
  if found and v_occurrence.status = 'skipped' then
    raise exception using errcode = '55000', message = 'A skipped occurrence must be restored before it can be settled';
  end if;

  v_expected_amount := coalesce(v_occurrence.override_amount_minor, v_rule.amount_minor);
  v_expected_date := coalesce(v_occurrence.override_date, p_occurrence_date);

  if v_rule.kind = 'income' then
    v_transaction_id := runway_private.post_income_impl(
      coalesce(p_destination_account_id, v_rule.destination_account_id),
      p_actual_amount_minor,
      coalesce(p_category_id, v_rule.category_id),
      p_occurred_at,
      v_rule.label,
      v_rule.label,
      p_notes,
      p_idempotency_key
    );
  elsif v_rule.kind = 'expense' then
    v_transaction_id := runway_private.post_expense_impl(
      coalesce(p_source_account_id, v_rule.source_account_id),
      p_actual_amount_minor,
      coalesce(p_category_id, v_rule.category_id),
      p_occurred_at,
      v_rule.label,
      v_rule.label,
      p_notes,
      p_idempotency_key
    );
  else
    v_transaction_id := runway_private.post_transfer_impl(
      coalesce(p_source_account_id, v_rule.source_account_id),
      coalesce(p_destination_account_id, v_rule.destination_account_id),
      p_actual_amount_minor,
      p_occurred_at,
      v_rule.label,
      p_notes,
      p_idempotency_key
    );
  end if;

  insert into public.recurring_occurrences (
    user_id,
    recurring_rule_id,
    occurrence_date,
    status,
    matched_transaction_id,
    expected_amount_minor_snapshot,
    expected_date_snapshot
  ) values (
    v_user_id,
    p_recurring_rule_id,
    p_occurrence_date,
    'matched',
    v_transaction_id,
    v_expected_amount,
    v_expected_date
  )
  on conflict (recurring_rule_id, occurrence_date) do update
  set status = 'matched',
      matched_transaction_id = excluded.matched_transaction_id,
      expected_amount_minor_snapshot = excluded.expected_amount_minor_snapshot,
      expected_date_snapshot = excluded.expected_date_snapshot,
      override_amount_minor = null,
      override_date = null;

  return v_transaction_id;
end;
$$;

revoke all on function public.settle_forecast_item(uuid,bigint,timestamptz,uuid,uuid,uuid,text,text) from public, anon;
revoke all on function public.settle_recurring_occurrence(uuid,date,bigint,timestamptz,uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.settle_forecast_item(uuid,bigint,timestamptz,uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.settle_recurring_occurrence(uuid,date,bigint,timestamptz,uuid,uuid,uuid,text,text) to authenticated;
