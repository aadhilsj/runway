create function public.settle_plan_item(
  p_scenario_change_id uuid,
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
  v_user_id uuid := (select auth.uid());
  v_change public.scenario_changes%rowtype;
  v_item public.forecast_items%rowtype;
  v_plan_name text;
  v_kind public.runway_planned_kind;
  v_label text;
  v_source_account_id uuid;
  v_destination_account_id uuid;
  v_category_id uuid;
  v_transaction_id uuid;
  v_activity_notes text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if (p_scenario_change_id is null) = (p_forecast_item_id is null) then
    raise exception using errcode = '22023', message = 'Choose exactly one Plan item';
  end if;
  if p_actual_amount_minor is null or p_actual_amount_minor <= 0 then
    raise exception using errcode = '22023', message = 'Actual amount must be positive';
  end if;

  if p_idempotency_key is not null then
    select id into v_transaction_id
    from public.transactions
    where user_id = v_user_id and idempotency_key = p_idempotency_key;
    if found then return v_transaction_id; end if;
  end if;

  if p_scenario_change_id is not null then
    select * into v_change
    from public.scenario_changes
    where id = p_scenario_change_id and user_id = v_user_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Plan item not found';
    end if;
    select name into v_plan_name
    from public.scenarios
    where id = v_change.scenario_id and user_id = v_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Plan not found';
    end if;
    if v_change.change_type not in ('add_one_off_income', 'add_one_off_expense', 'add_one_off_transfer') then
      raise exception using errcode = '55000', message = 'Only a one-off Plan item can be settled';
    end if;

    v_kind := case v_change.change_type
      when 'add_one_off_income' then 'income'::public.runway_planned_kind
      when 'add_one_off_expense' then 'expense'::public.runway_planned_kind
      else 'transfer'::public.runway_planned_kind
    end;
    v_label := v_change.label;
    v_source_account_id := v_change.source_account_id;
    v_destination_account_id := v_change.destination_account_id;
    v_category_id := v_change.category_id;
  else
    select * into v_item
    from public.forecast_items
    where id = p_forecast_item_id and user_id = v_user_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Plan item not found';
    end if;
    if v_item.scenario_id is null or v_item.status <> 'expected' then
      raise exception using errcode = '55000', message = 'Only an expected Plan item can be settled';
    end if;

    select name into v_plan_name
    from public.scenarios
    where id = v_item.scenario_id and user_id = v_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Plan not found';
    end if;

    v_kind := v_item.kind;
    v_label := v_item.label;
    v_source_account_id := v_item.source_account_id;
    v_destination_account_id := v_item.destination_account_id;
    v_category_id := v_item.category_id;
  end if;

  v_activity_notes := nullif(concat_ws(E'\n', nullif(btrim(p_notes), ''), 'Plan: ' || v_plan_name), '');

  if v_kind = 'income' then
    v_transaction_id := runway_private.post_income_impl(
      coalesce(p_destination_account_id, v_destination_account_id),
      p_actual_amount_minor,
      coalesce(p_category_id, v_category_id),
      p_occurred_at,
      v_label,
      v_label,
      v_activity_notes,
      p_idempotency_key
    );
  elsif v_kind = 'expense' then
    v_transaction_id := runway_private.post_expense_impl(
      coalesce(p_source_account_id, v_source_account_id),
      p_actual_amount_minor,
      coalesce(p_category_id, v_category_id),
      p_occurred_at,
      v_label,
      v_label,
      v_activity_notes,
      p_idempotency_key
    );
  else
    v_transaction_id := runway_private.post_transfer_impl(
      coalesce(p_source_account_id, v_source_account_id),
      coalesce(p_destination_account_id, v_destination_account_id),
      p_actual_amount_minor,
      p_occurred_at,
      v_label,
      v_activity_notes,
      p_idempotency_key
    );
  end if;

  if p_scenario_change_id is not null then
    delete from public.scenario_changes
    where id = v_change.id and user_id = v_user_id;
  else
    update public.forecast_items
    set status = 'matched',
        matched_transaction_id = v_transaction_id,
        expected_amount_minor_snapshot = amount_minor,
        expected_date_snapshot = expected_date
    where id = v_item.id and user_id = v_user_id;
  end if;

  return v_transaction_id;
end;
$$;

revoke all on function public.settle_plan_item(uuid,uuid,bigint,timestamptz,uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.settle_plan_item(uuid,uuid,bigint,timestamptz,uuid,uuid,uuid,text,text) to authenticated;
