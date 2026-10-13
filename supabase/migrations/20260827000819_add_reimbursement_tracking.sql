alter table public.accounts
  add column hidden_from_accounts boolean not null default false;

alter table public.accounts
  add constraint accounts_hidden_shape
  check (not hidden_from_accounts or (not is_system and class = 'asset' and include_in_net_worth));

drop policy if exists accounts_update_own_non_system on public.accounts;
create policy accounts_update_own_non_system on public.accounts
  for update to authenticated
  using ((select auth.uid()) = user_id and not is_system and not hidden_from_accounts)
  with check ((select auth.uid()) = user_id and not is_system and not hidden_from_accounts);

drop policy if exists accounts_delete_own_non_system on public.accounts;
create policy accounts_delete_own_non_system on public.accounts
  for delete to authenticated
  using ((select auth.uid()) = user_id and not is_system and not hidden_from_accounts);

create table public.reimbursement_pools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  receivable_account_id uuid not null,
  destination_account_id uuid not null,
  forecast_item_id uuid,
  expected_date date not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, user_id),
  unique (user_id, receivable_account_id),
  unique (user_id, forecast_item_id),
  foreign key (receivable_account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (destination_account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (forecast_item_id, user_id) references public.forecast_items(id, user_id) on delete restrict
);

create table public.reimbursement_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pool_id uuid not null,
  transaction_id uuid,
  entry_kind text not null check (entry_kind in ('opening_balance', 'expense_share', 'manual_adjustment', 'repayment', 'reversal')),
  delta_minor bigint not null check (delta_minor <> 0),
  occurred_at timestamptz not null,
  description text not null check (char_length(btrim(description)) between 1 and 240),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, user_id),
  unique (pool_id, transaction_id),
  foreign key (pool_id, user_id) references public.reimbursement_pools(id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions(id, user_id) on delete restrict
);

create index reimbursement_entries_pool_occurred_idx
  on public.reimbursement_entries(pool_id, occurred_at desc, id desc);
create index reimbursement_entries_user_transaction_idx
  on public.reimbursement_entries(user_id, transaction_id)
  where transaction_id is not null;

alter table public.reimbursement_pools enable row level security;
alter table public.reimbursement_entries enable row level security;

create policy reimbursement_pools_select_own on public.reimbursement_pools
  for select to authenticated using ((select auth.uid()) = user_id);
create policy reimbursement_entries_select_own on public.reimbursement_entries
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.reimbursement_pools from anon;
revoke all on public.reimbursement_entries from anon;
revoke insert, update, delete on public.reimbursement_pools from authenticated;
revoke insert, update, delete on public.reimbursement_entries from authenticated;
grant select on public.reimbursement_pools to authenticated;
grant select on public.reimbursement_entries to authenticated;

create or replace function runway_private.sync_reimbursement_forecast_impl(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pool public.reimbursement_pools%rowtype;
  v_outstanding bigint;
  v_item public.forecast_items%rowtype;
  v_item_id uuid;
begin
  select * into v_pool from public.reimbursement_pools where id = p_pool_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Reimbursement pool not found'; end if;

  select coalesce(sum(delta_minor), 0)::bigint into v_outstanding
  from public.reimbursement_entries where pool_id = v_pool.id and user_id = v_pool.user_id;
  if v_outstanding < 0 then raise exception using errcode = '23514', message = 'Reimbursement balance cannot be negative'; end if;

  if v_pool.forecast_item_id is not null then
    select * into v_item from public.forecast_items
    where id = v_pool.forecast_item_id and user_id = v_pool.user_id for update;
  end if;

  if v_outstanding = 0 then
    if v_item.id is not null then
      update public.reimbursement_pools set forecast_item_id = null, updated_at = clock_timestamp()
        where id = v_pool.id;
      delete from public.forecast_items where id = v_item.id and user_id = v_pool.user_id;
    else
      update public.reimbursement_pools set forecast_item_id = null, updated_at = clock_timestamp()
        where id = v_pool.id;
    end if;
    return;
  end if;

  if v_item.id is null then
    insert into public.forecast_items (
      user_id, kind, expected_date, amount_minor, source_account_id,
      destination_account_id, category_id, label, notes, confidence, status
    ) values (
      v_pool.user_id, 'transfer', v_pool.expected_date, v_outstanding,
      v_pool.receivable_account_id, v_pool.destination_account_id, null,
      v_pool.name, 'Reimbursement repayment tracked from Activity.', 'expected', 'expected'
    ) returning id into v_item_id;
    update public.reimbursement_pools set forecast_item_id = v_item_id, updated_at = clock_timestamp()
      where id = v_pool.id;
  else
    update public.forecast_items set
      kind = 'transfer', expected_date = v_pool.expected_date, amount_minor = v_outstanding,
      source_account_id = v_pool.receivable_account_id,
      destination_account_id = v_pool.destination_account_id,
      category_id = null, label = v_pool.name,
      notes = 'Reimbursement repayment tracked from Activity.',
      confidence = 'expected', status = 'expected', matched_transaction_id = null,
      expected_amount_minor_snapshot = null, expected_date_snapshot = null,
      updated_at = clock_timestamp()
    where id = v_item.id and user_id = v_pool.user_id;
  end if;
end;
$function$;

create or replace function runway_private.convert_forecast_item_to_reimbursement_pool_impl(
  p_user_id uuid,
  p_forecast_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.forecast_items%rowtype;
  v_profile public.profiles%rowtype;
  v_pool_id uuid;
  v_receivable_id uuid;
  v_equity_id uuid;
  v_transaction_id uuid;
begin
  select * into v_item from public.forecast_items
    where id = p_forecast_item_id and user_id = p_user_id and status = 'expected' for update;
  if not found then raise exception using errcode = 'P0002', message = 'Expected forecast item not found'; end if;
  if v_item.kind <> 'income' or v_item.destination_account_id is null or v_item.scenario_id is not null then
    raise exception using errcode = '23514', message = 'Only a base income forecast item can become a reimbursement balance';
  end if;
  if exists (select 1 from public.reimbursement_pools where user_id = p_user_id and forecast_item_id = v_item.id) then
    select id into v_pool_id from public.reimbursement_pools where user_id = p_user_id and forecast_item_id = v_item.id;
    return v_pool_id;
  end if;
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'Profile not found'; end if;

  perform runway_private.ensure_system_accounts_impl(p_user_id, v_profile.base_currency);
  select id into v_equity_id from public.accounts
    where user_id = p_user_id and system_key = 'opening_equity' and currency = v_profile.base_currency;

  insert into public.accounts (
    user_id, name, class, subtype, currency, is_system, include_in_net_worth,
    liquidity_class, valuation_mode, opened_on, hidden_from_accounts
  ) values (
    p_user_id, v_item.label || ' receivable', 'asset', 'savings', v_profile.base_currency,
    false, true, 'non_liquid', 'ledger', current_date, true
  ) returning id into v_receivable_id;

  v_transaction_id := runway_private.post_transaction_impl(
    'opening_balance', v_profile.base_currency, clock_timestamp(),
    v_item.label || ' opening amount owed', v_item.label,
    'Converted from the existing forecast amount.', 'verified',
    'reimbursement-opening:' || v_item.id::text,
    jsonb_build_array(
      jsonb_build_object('account_id', v_receivable_id, 'amount_minor', v_item.amount_minor),
      jsonb_build_object('account_id', v_equity_id, 'amount_minor', -v_item.amount_minor)
    ), null
  );

  insert into public.reimbursement_pools (
    user_id, name, receivable_account_id, destination_account_id, forecast_item_id, expected_date
  ) values (
    p_user_id, v_item.label, v_receivable_id, v_item.destination_account_id, v_item.id, v_item.expected_date
  ) returning id into v_pool_id;

  insert into public.reimbursement_entries (
    user_id, pool_id, transaction_id, entry_kind, delta_minor, occurred_at, description
  ) values (
    p_user_id, v_pool_id, v_transaction_id, 'opening_balance', v_item.amount_minor,
    clock_timestamp(), 'Opening amount already owed'
  );

  update public.forecast_items set
    kind = 'transfer', source_account_id = v_receivable_id, category_id = null,
    notes = 'Reimbursement repayment tracked from Activity.', updated_at = clock_timestamp()
  where id = v_item.id and user_id = p_user_id;
  return v_pool_id;
end;
$function$;

create or replace function public.convert_forecast_item_to_reimbursement_pool(p_forecast_item_id uuid)
returns uuid
language sql
set search_path = ''
as $function$
  select runway_private.convert_forecast_item_to_reimbursement_pool_impl((select auth.uid()), $1)
$function$;

create or replace function public.post_split_expense(
  p_source_account_id uuid,
  p_amount_minor bigint,
  p_reimbursable_minor bigint,
  p_pool_id uuid,
  p_category_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_source public.accounts%rowtype;
  v_pool public.reimbursement_pools%rowtype;
  v_expense_account_id uuid;
  v_personal_minor bigint;
  v_transaction_id uuid;
  v_entries jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception using errcode = '22023', message = 'Expense amount must be positive'; end if;
  if p_reimbursable_minor is null or p_reimbursable_minor <= 0 or p_reimbursable_minor > p_amount_minor then
    raise exception using errcode = '22023', message = 'Reimbursable amount must be positive and no more than the total';
  end if;
  v_personal_minor := p_amount_minor - p_reimbursable_minor;
  select * into v_source from public.accounts
    where id = p_source_account_id and user_id = v_user_id and archived_at is null;
  select * into v_pool from public.reimbursement_pools
    where id = p_pool_id and user_id = v_user_id for update;
  if v_source.id is null or v_source.class <> 'asset' or v_source.hidden_from_accounts then
    raise exception using errcode = '42501', message = 'Source must be an available cash account';
  end if;
  if v_pool.id is null then raise exception using errcode = '42501', message = 'Reimbursement tracker is unavailable'; end if;
  if v_source.currency <> (select currency from public.accounts where id = v_pool.receivable_account_id) then
    raise exception using errcode = '23514', message = 'Reimbursement currency must match the expense';
  end if;
  perform runway_private.ensure_system_accounts_impl(v_user_id, v_source.currency);
  select id into v_expense_account_id from public.accounts
    where user_id = v_user_id and system_key = 'expense' and currency = v_source.currency;

  v_entries := jsonb_build_array(
    jsonb_build_object('account_id', v_source.id, 'amount_minor', -p_amount_minor),
    jsonb_build_object('account_id', v_pool.receivable_account_id, 'amount_minor', p_reimbursable_minor)
  );
  if v_personal_minor > 0 then
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account_id', v_expense_account_id, 'amount_minor', v_personal_minor, 'category_id', p_category_id)
    );
  end if;

  v_transaction_id := runway_private.post_transaction_impl(
    'expense', v_source.currency, p_occurred_at, p_description, p_description, p_notes,
    'verified', p_idempotency_key, v_entries, null
  );
  insert into public.reimbursement_entries (
    user_id, pool_id, transaction_id, entry_kind, delta_minor, occurred_at, description
  ) values (
    v_user_id, v_pool.id, v_transaction_id, 'expense_share', p_reimbursable_minor,
    p_occurred_at, p_description
  ) on conflict (pool_id, transaction_id) do nothing;
  perform runway_private.sync_reimbursement_forecast_impl(v_pool.id);
  return v_transaction_id;
end;
$function$;

create or replace function public.record_reimbursement(
  p_pool_id uuid,
  p_destination_account_id uuid,
  p_amount_minor bigint,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_pool public.reimbursement_pools%rowtype;
  v_destination public.accounts%rowtype;
  v_receivable public.accounts%rowtype;
  v_outstanding bigint;
  v_transaction_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select * into v_pool from public.reimbursement_pools where id = p_pool_id and user_id = v_user_id for update;
  select * into v_destination from public.accounts where id = p_destination_account_id and user_id = v_user_id and archived_at is null;
  select * into v_receivable from public.accounts where id = v_pool.receivable_account_id and user_id = v_user_id;
  select coalesce(sum(delta_minor), 0)::bigint into v_outstanding from public.reimbursement_entries
    where pool_id = v_pool.id and user_id = v_user_id;
  if v_pool.id is null or v_destination.id is null or v_destination.class <> 'asset' or v_destination.hidden_from_accounts then
    raise exception using errcode = '42501', message = 'Reimbursement destination is unavailable';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > v_outstanding then
    raise exception using errcode = '22023', message = 'Repayment must be positive and no more than the outstanding amount';
  end if;
  if v_destination.currency <> v_receivable.currency then raise exception using errcode = '23514', message = 'Repayment currency must match'; end if;

  v_transaction_id := runway_private.post_transaction_impl(
    'reimbursement', v_destination.currency, p_occurred_at, v_pool.name,
    v_pool.name, p_notes, 'verified', p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', v_pool.receivable_account_id, 'amount_minor', -p_amount_minor),
      jsonb_build_object('account_id', v_destination.id, 'amount_minor', p_amount_minor)
    ), null
  );
  insert into public.reimbursement_entries (
    user_id, pool_id, transaction_id, entry_kind, delta_minor, occurred_at, description
  ) values (
    v_user_id, v_pool.id, v_transaction_id, 'repayment', -p_amount_minor,
    p_occurred_at, 'Repayment received'
  ) on conflict (pool_id, transaction_id) do nothing;
  update public.reimbursement_pools set destination_account_id = v_destination.id, updated_at = clock_timestamp()
    where id = v_pool.id;
  perform runway_private.sync_reimbursement_forecast_impl(v_pool.id);
  return v_transaction_id;
end;
$function$;

create or replace function public.adjust_reimbursement_pool(
  p_pool_id uuid,
  p_total_minor bigint,
  p_expected_date date,
  p_description text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_pool public.reimbursement_pools%rowtype;
  v_receivable public.accounts%rowtype;
  v_adjustments_id uuid;
  v_outstanding bigint;
  v_delta bigint;
  v_transaction_id uuid := null;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_total_minor is null or p_total_minor < 0 then raise exception using errcode = '22023', message = 'Total owed cannot be negative'; end if;
  select * into v_pool from public.reimbursement_pools where id = p_pool_id and user_id = v_user_id for update;
  if not found then raise exception using errcode = '42501', message = 'Reimbursement tracker is unavailable'; end if;
  select * into v_receivable from public.accounts where id = v_pool.receivable_account_id and user_id = v_user_id;
  select coalesce(sum(delta_minor), 0)::bigint into v_outstanding from public.reimbursement_entries
    where pool_id = v_pool.id and user_id = v_user_id;
  v_delta := p_total_minor - v_outstanding;
  update public.reimbursement_pools set expected_date = p_expected_date, updated_at = clock_timestamp()
    where id = v_pool.id;
  if v_delta <> 0 then
    perform runway_private.ensure_system_accounts_impl(v_user_id, v_receivable.currency);
    select id into v_adjustments_id from public.accounts
      where user_id = v_user_id and system_key = 'adjustments' and currency = v_receivable.currency;
    v_transaction_id := runway_private.post_transaction_impl(
      'adjustment', v_receivable.currency, clock_timestamp(),
      coalesce(nullif(btrim(p_description), ''), 'Reimbursement balance correction'),
      v_pool.name, 'Manual reimbursement total correction.', 'verified', p_idempotency_key,
      jsonb_build_array(
        jsonb_build_object('account_id', v_pool.receivable_account_id, 'amount_minor', v_delta),
        jsonb_build_object('account_id', v_adjustments_id, 'amount_minor', -v_delta)
      ), null
    );
    insert into public.reimbursement_entries (
      user_id, pool_id, transaction_id, entry_kind, delta_minor, occurred_at, description
    ) values (
      v_user_id, v_pool.id, v_transaction_id, 'manual_adjustment', v_delta,
      clock_timestamp(), coalesce(nullif(btrim(p_description), ''), 'Manual balance correction')
    ) on conflict (pool_id, transaction_id) do nothing;
  end if;
  perform runway_private.sync_reimbursement_forecast_impl(v_pool.id);
  return v_transaction_id;
end;
$function$;

create or replace function runway_private.reverse_transaction_impl(
  p_transaction_id uuid,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_original public.transactions%rowtype;
  v_existing public.transactions%rowtype;
  v_entries jsonb;
  v_reversal_id uuid;
  v_link record;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_idempotency_key is not null then
    select * into v_existing from public.transactions where user_id = v_user_id and idempotency_key = p_idempotency_key;
    if found then
      if v_existing.reverses_transaction_id = p_transaction_id then return v_existing.id; end if;
      raise exception using errcode = '23505', message = 'Idempotency key was already used with a different command';
    end if;
  end if;
  select * into v_original from public.transactions
    where id = p_transaction_id and user_id = v_user_id and status = 'posted' for update;
  if not found then raise exception using errcode = '42501', message = 'Posted transaction is unavailable or belongs to another user'; end if;
  if v_original.reverses_transaction_id is not null then raise exception using errcode = '55000', message = 'A reversal cannot itself be reversed'; end if;
  if exists (select 1 from public.transactions where user_id = v_user_id and reverses_transaction_id = p_transaction_id) then
    raise exception using errcode = '23505', message = 'Transaction was already reversed';
  end if;
  select jsonb_agg(jsonb_build_object(
    'account_id', account_id, 'amount_minor', -amount_minor,
    'category_id', category_id, 'memo', case when memo is null then null else 'Reversal: ' || memo end
  ) order by id) into v_entries from public.transaction_entries where transaction_id = p_transaction_id;
  v_reversal_id := runway_private.post_transaction_impl(
    v_original.kind, v_original.currency, p_occurred_at, 'Reversal: ' || v_original.description,
    v_original.merchant_or_source, p_notes, v_original.data_quality, p_idempotency_key,
    v_entries, v_original.id
  );
  for v_link in
    select pool_id, sum(delta_minor)::bigint as delta_minor
    from public.reimbursement_entries
    where transaction_id = p_transaction_id and user_id = v_user_id group by pool_id
  loop
    insert into public.reimbursement_entries (
      user_id, pool_id, transaction_id, entry_kind, delta_minor, occurred_at, description
    ) values (
      v_user_id, v_link.pool_id, v_reversal_id, 'reversal', -v_link.delta_minor,
      p_occurred_at, 'Reversal: ' || v_original.description
    ) on conflict (pool_id, transaction_id) do nothing;
    perform runway_private.sync_reimbursement_forecast_impl(v_link.pool_id);
  end loop;
  return v_reversal_id;
end;
$function$;

revoke all on function public.convert_forecast_item_to_reimbursement_pool(uuid) from public, anon;
revoke all on function public.post_split_expense(uuid,bigint,bigint,uuid,uuid,timestamptz,text,text,text) from public, anon;
revoke all on function public.record_reimbursement(uuid,uuid,bigint,timestamptz,text,text) from public, anon;
revoke all on function public.adjust_reimbursement_pool(uuid,bigint,date,text,text) from public, anon;
grant execute on function public.convert_forecast_item_to_reimbursement_pool(uuid) to authenticated;
grant execute on function public.post_split_expense(uuid,bigint,bigint,uuid,uuid,timestamptz,text,text,text) to authenticated;
grant execute on function public.record_reimbursement(uuid,uuid,bigint,timestamptz,text,text) to authenticated;
grant execute on function public.adjust_reimbursement_pool(uuid,bigint,date,text,text) to authenticated;
