-- Let a split expense open its own reimbursement tracker.
--
-- Until now the only way to get a tracker was to convert an existing forecast
-- income item, so the Activity screen had exactly one and hard-coded it. Every
-- shared expense landed on the flatmate's Splitwise balance even when a
-- different group owed the money.
--
-- Trackers are per occasion, not per person: "Paddle (Tom, Mina, Sam)" holds
-- the whole amount that evening's group owes, and next month's game with other
-- people opens a new one. Creating a tracker is therefore part of logging the
-- expense rather than a separate chore, which also means a tracker never
-- exists at zero waiting to be used and can be hidden the moment it settles.
--
-- Creating and posting in one function keeps them in a single transaction, so
-- a failed expense cannot leave an orphan tracker behind. The idempotency key
-- is checked first for the same reason: a retry returns the original
-- transaction instead of opening a second tracker for it.
create or replace function public.post_split_expense_to_new_pool(
  p_source_account_id uuid,
  p_amount_minor bigint,
  p_reimbursable_minor bigint,
  p_pool_name text,
  p_expected_date date,
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
  v_existing uuid;
  v_source public.accounts%rowtype;
  v_name text := btrim(coalesce(p_pool_name, ''));
  v_receivable_id uuid;
  v_pool_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;

  -- A retry must not open a second tracker for an expense that already posted.
  if p_idempotency_key is not null then
    select id into v_existing from public.transactions
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    if found then return v_existing; end if;
  end if;

  -- The receivable account appends " receivable", so leave room inside the 120 character limit.
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception using errcode = '22023', message = 'Tracker name must be between 1 and 100 characters';
  end if;
  if p_expected_date is null then
    raise exception using errcode = '22023', message = 'Tracker needs a date you expect the money back';
  end if;

  select * into v_source from public.accounts
    where id = p_source_account_id and user_id = v_user_id and archived_at is null;
  if v_source.id is null or v_source.class <> 'asset' or v_source.hidden_from_accounts then
    raise exception using errcode = '42501', message = 'Source must be an available cash account';
  end if;

  perform runway_private.ensure_system_accounts_impl(v_user_id, v_source.currency);

  -- No opening balance: a new tracker starts empty and accrues from this expense onward.
  insert into public.accounts (
    user_id, name, class, subtype, currency, is_system, include_in_net_worth,
    liquidity_class, valuation_mode, opened_on, hidden_from_accounts
  ) values (
    v_user_id, v_name || ' receivable', 'asset', 'savings', v_source.currency,
    false, true, 'non_liquid', 'ledger', current_date, true
  ) returning id into v_receivable_id;

  insert into public.reimbursement_pools (
    user_id, name, receivable_account_id, destination_account_id, forecast_item_id, expected_date
  ) values (
    v_user_id, v_name, v_receivable_id, v_source.id, null, p_expected_date
  ) returning id into v_pool_id;

  -- Delegates so the ledger shape, budget treatment, and forecast sync stay in one place.
  return public.post_split_expense(
    p_source_account_id, p_amount_minor, p_reimbursable_minor, v_pool_id,
    p_category_id, p_occurred_at, p_description, p_notes, p_idempotency_key
  );
end;
$function$;

revoke all on function public.post_split_expense_to_new_pool(uuid,bigint,bigint,text,date,uuid,timestamptz,text,text,text) from public, anon;
grant execute on function public.post_split_expense_to_new_pool(uuid,bigint,bigint,text,date,uuid,timestamptz,text,text,text) to authenticated;
