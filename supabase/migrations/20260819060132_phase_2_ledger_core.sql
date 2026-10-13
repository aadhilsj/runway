-- Runway 2 Phase 2: normalized ledger foundation (remote migration version 20260819060132).
-- This migration intentionally does not read from or write to public.runway_state.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists runway_private;
revoke all on schema runway_private from public, anon;

create type public.runway_account_class as enum ('asset', 'liability', 'income', 'expense', 'equity');
create type public.runway_account_subtype as enum ('checking', 'savings', 'cash', 'investment', 'credit_card', 'loan', 'system');
create type public.runway_liquidity_class as enum ('operating', 'liquid', 'invested', 'liability', 'non_liquid');
create type public.runway_valuation_mode as enum ('ledger', 'manual_market_value');
create type public.runway_system_account_key as enum ('income', 'expense', 'opening_equity', 'adjustments');
create type public.runway_category_kind as enum ('income', 'expense');
create type public.runway_transaction_kind as enum (
  'income', 'expense', 'transfer', 'refund', 'reimbursement', 'debt_payment', 'opening_balance', 'adjustment'
);
create type public.runway_transaction_status as enum ('draft', 'posted', 'void');
create type public.runway_data_quality as enum ('verified', 'imported_actual', 'planned_as_actual', 'inferred');
create type public.runway_snapshot_source as enum ('manual', 'statement', 'migration');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  base_currency text not null,
  timezone text not null default 'UTC',
  operating_floor_minor bigint,
  forecast_horizon_months integer,
  safety_window_days integer,
  schema_version integer not null default 1,
  display_name text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint profiles_currency_format check (base_currency ~ '^[A-Z]{3}$'),
  constraint profiles_forecast_horizon_positive check (forecast_horizon_months is null or forecast_horizon_months > 0),
  constraint profiles_safety_window_nonnegative check (safety_window_days is null or safety_window_days >= 0),
  constraint profiles_schema_version_positive check (schema_version > 0),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 120)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  class public.runway_account_class not null,
  subtype public.runway_account_subtype not null,
  currency text not null,
  is_system boolean not null default false,
  system_key public.runway_system_account_key,
  include_in_net_worth boolean not null default true,
  liquidity_class public.runway_liquidity_class not null,
  valuation_mode public.runway_valuation_mode not null default 'ledger',
  creation_idempotency_key text,
  creation_payload jsonb,
  opened_on date,
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint accounts_id_user_unique unique (id, user_id),
  constraint accounts_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint accounts_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint accounts_creation_idempotency_length check (creation_idempotency_key is null or char_length(creation_idempotency_key) between 1 and 128),
  constraint accounts_creation_payload_pair check ((creation_idempotency_key is null) = (creation_payload is null)),
  constraint accounts_system_shape check (
    (is_system and system_key is not null and subtype = 'system')
    or (not is_system and system_key is null and subtype <> 'system')
  ),
  constraint accounts_subtype_class check (
    subtype = 'system'
    or (subtype in ('checking', 'savings', 'cash', 'investment') and class = 'asset')
    or (subtype in ('credit_card', 'loan') and class = 'liability')
  ),
  constraint accounts_liquidity_class check (
    (class = 'liability' and liquidity_class = 'liability')
    or (class <> 'liability' and liquidity_class <> 'liability')
  ),
  constraint accounts_system_not_net_worth check (not is_system or not include_in_net_worth)
);

create unique index accounts_system_key_currency_uidx
  on public.accounts (user_id, system_key, currency)
  where system_key is not null;
create unique index accounts_user_creation_idempotency_uidx
  on public.accounts (user_id, creation_idempotency_key)
  where creation_idempotency_key is not null;
create index accounts_user_active_idx on public.accounts (user_id, created_at) where archived_at is null;
create index accounts_user_class_idx on public.accounts (user_id, class);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind public.runway_category_kind not null,
  parent_id uuid,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint categories_id_user_unique unique (id, user_id),
  constraint categories_parent_owner_fkey foreign key (parent_id, user_id)
    references public.categories (id, user_id) on delete restrict,
  constraint categories_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint categories_sort_order_nonnegative check (sort_order >= 0),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create index categories_user_kind_active_idx on public.categories (user_id, kind, sort_order) where archived_at is null;
create index categories_parent_id_idx on public.categories (parent_id) where parent_id is not null;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.runway_transaction_kind not null,
  status public.runway_transaction_status not null default 'draft',
  currency text not null,
  occurred_at timestamptz not null,
  description text not null,
  merchant_or_source text,
  notes text,
  reverses_transaction_id uuid,
  legacy_source_id text,
  data_quality public.runway_data_quality not null default 'verified',
  idempotency_key text,
  idempotency_payload jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  posted_at timestamptz,
  voided_at timestamptz,
  constraint transactions_id_user_unique unique (id, user_id),
  constraint transactions_reversal_owner_fkey foreign key (reverses_transaction_id, user_id)
    references public.transactions (id, user_id) on delete restrict,
  constraint transactions_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint transactions_description_length check (char_length(btrim(description)) between 1 and 240),
  constraint transactions_merchant_length check (merchant_or_source is null or char_length(merchant_or_source) <= 240),
  constraint transactions_notes_length check (notes is null or char_length(notes) <= 4000),
  constraint transactions_idempotency_length check (idempotency_key is null or char_length(idempotency_key) between 1 and 128),
  constraint transactions_idempotency_payload_pair check ((idempotency_key is null) = (idempotency_payload is null)),
  constraint transactions_status_timestamps check (
    (status = 'draft' and posted_at is null and voided_at is null)
    or (status = 'posted' and posted_at is not null and voided_at is null)
    or (status = 'void' and posted_at is null and voided_at is not null)
  ),
  constraint transactions_reversal_not_self check (reverses_transaction_id is null or reverses_transaction_id <> id)
);

create unique index transactions_user_idempotency_uidx
  on public.transactions (user_id, idempotency_key)
  where idempotency_key is not null;
create unique index transactions_one_reversal_uidx
  on public.transactions (user_id, reverses_transaction_id)
  where reverses_transaction_id is not null;
create index transactions_user_occurred_idx on public.transactions (user_id, occurred_at desc);
create index transactions_user_status_occurred_idx on public.transactions (user_id, status, occurred_at desc);
create index transactions_reverses_idx on public.transactions (reverses_transaction_id) where reverses_transaction_id is not null;
create index transactions_legacy_source_idx on public.transactions (user_id, legacy_source_id) where legacy_source_id is not null;

create table public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  account_id uuid not null,
  amount_minor bigint not null,
  category_id uuid,
  memo text,
  created_at timestamptz not null default clock_timestamp(),
  constraint transaction_entries_transaction_owner_fkey foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete restrict,
  constraint transaction_entries_account_owner_fkey foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint transaction_entries_category_owner_fkey foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete restrict,
  constraint transaction_entries_amount_nonzero check (amount_minor <> 0),
  constraint transaction_entries_memo_length check (memo is null or char_length(memo) <= 500)
);

create index transaction_entries_transaction_idx on public.transaction_entries (transaction_id);
create index transaction_entries_account_idx on public.transaction_entries (account_id, transaction_id);
create index transaction_entries_category_idx on public.transaction_entries (category_id) where category_id is not null;
create index transaction_entries_user_idx on public.transaction_entries (user_id);

create table public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  observed_at timestamptz not null,
  balance_minor bigint not null,
  source public.runway_snapshot_source not null,
  notes text,
  reconciliation_transaction_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint account_snapshots_account_owner_fkey foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint account_snapshots_transaction_owner_fkey foreign key (reconciliation_transaction_id, user_id)
    references public.transactions (id, user_id) on delete restrict,
  constraint account_snapshots_notes_length check (notes is null or char_length(notes) <= 2000)
);

create index account_snapshots_account_observed_idx on public.account_balance_snapshots (account_id, observed_at desc);
create index account_snapshots_user_observed_idx on public.account_balance_snapshots (user_id, observed_at desc);
create index account_snapshots_reconciliation_idx on public.account_balance_snapshots (reconciliation_transaction_id)
  where reconciliation_transaction_id is not null;

create function runway_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function runway_private.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts
for each row execute function runway_private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
for each row execute function runway_private.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
for each row execute function runway_private.set_updated_at();

create function runway_private.validate_entry_relationships()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction_currency text;
  v_account_currency text;
begin
  select currency into v_transaction_currency
  from public.transactions
  where id = new.transaction_id and user_id = new.user_id;

  select currency into v_account_currency
  from public.accounts
  where id = new.account_id and user_id = new.user_id;

  if v_transaction_currency is null or v_account_currency is null then
    raise exception using errcode = '23503', message = 'Transaction and account must belong to the entry owner';
  end if;
  if v_transaction_currency <> v_account_currency then
    raise exception using errcode = '23514', message = 'Cross-currency entries are not supported';
  end if;
  return new;
end;
$$;

create trigger transaction_entries_validate_relationships
before insert or update on public.transaction_entries
for each row execute function runway_private.validate_entry_relationships();

create function runway_private.protect_posted_transaction()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception using errcode = '55000', message = 'Posted transactions cannot be deleted; reverse them instead';
    end if;
    return old;
  end if;

  if old.status = 'posted' then
    raise exception using errcode = '55000', message = 'Posted transactions are immutable; reverse them instead';
  end if;
  if old.status = 'void' then
    raise exception using errcode = '55000', message = 'Voided transactions are immutable';
  end if;
  if new.user_id <> old.user_id or new.id <> old.id then
    raise exception using errcode = '55000', message = 'Transaction identity is immutable';
  end if;
  if new.status not in ('draft', 'posted', 'void') then
    raise exception using errcode = '23514', message = 'Invalid transaction status transition';
  end if;
  return new;
end;
$$;

create function runway_private.protect_account_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.class <> old.class
    or new.currency <> old.currency
    or new.is_system <> old.is_system
    or new.system_key is distinct from old.system_key
    or new.creation_idempotency_key is distinct from old.creation_idempotency_key
    or new.creation_payload is distinct from old.creation_payload
  then
    raise exception using errcode = '55000', message = 'Account ownership, class, currency, and creation identity are immutable';
  end if;
  return new;
end;
$$;

create trigger accounts_protect_identity
before update on public.accounts
for each row execute function runway_private.protect_account_identity();

create trigger transactions_protect_posted
before update or delete on public.transactions
for each row execute function runway_private.protect_posted_transaction();

create function runway_private.protect_posted_entries()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction_id uuid := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;
begin
  if exists (select 1 from public.transactions where id = v_transaction_id and status = 'posted') then
    raise exception using errcode = '55000', message = 'Entries of posted transactions are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger transaction_entries_protect_posted
before update or delete on public.transaction_entries
for each row execute function runway_private.protect_posted_entries();

create function runway_private.assert_transaction_balanced()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_status public.runway_transaction_status;
  v_count integer;
  v_sum numeric;
begin
  if tg_table_name = 'transactions' then
    v_transaction_id := coalesce(new.id, old.id);
  else
    v_transaction_id := coalesce(new.transaction_id, old.transaction_id);
  end if;
  select status into v_status from public.transactions where id = v_transaction_id;
  if v_status = 'posted' then
    select count(*), coalesce(sum(amount_minor::numeric), 0)
      into v_count, v_sum
    from public.transaction_entries
    where transaction_id = v_transaction_id;
    if v_count < 2 or v_sum <> 0 then
      raise exception using errcode = '23514', message = 'Posted transaction must have at least two entries that sum to zero';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger transactions_balance_check
after insert or update of status on public.transactions
deferrable initially deferred
for each row execute function runway_private.assert_transaction_balanced();

create constraint trigger transaction_entries_balance_check
after insert or update or delete on public.transaction_entries
deferrable initially deferred
for each row execute function runway_private.assert_transaction_balanced();

create function runway_private.ensure_system_accounts_impl(p_user_id uuid, p_currency text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'A user and ISO currency are required';
  end if;

  insert into public.accounts (user_id, name, class, subtype, currency, is_system, system_key, include_in_net_worth, liquidity_class)
  values
    (p_user_id, 'Income', 'income', 'system', p_currency, true, 'income', false, 'non_liquid'),
    (p_user_id, 'Expenses', 'expense', 'system', p_currency, true, 'expense', false, 'non_liquid'),
    (p_user_id, 'Opening equity', 'equity', 'system', p_currency, true, 'opening_equity', false, 'non_liquid'),
    (p_user_id, 'Adjustments', 'equity', 'system', p_currency, true, 'adjustments', false, 'non_liquid')
  on conflict (user_id, system_key, currency) where system_key is not null do nothing;
end;
$$;

create function runway_private.post_transaction_impl(
  p_kind public.runway_transaction_kind,
  p_currency text,
  p_occurred_at timestamptz,
  p_description text,
  p_merchant_or_source text,
  p_notes text,
  p_data_quality public.runway_data_quality,
  p_idempotency_key text,
  p_entries jsonb,
  p_reverses_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_transaction_id uuid;
  v_existing public.transactions%rowtype;
  v_entry jsonb;
  v_account_id uuid;
  v_category_id uuid;
  v_amount bigint;
  v_sum numeric := 0;
  v_payload jsonb;
  v_account public.accounts%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'A valid ISO currency is required';
  end if;
  if p_occurred_at is null then
    raise exception using errcode = '22023', message = 'occurred_at is required';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'Description must contain 1 to 240 characters';
  end if;
  if p_idempotency_key is not null and char_length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'Idempotency key must contain 1 to 128 characters';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception using errcode = '22023', message = 'At least two entries are required';
  end if;
  if p_reverses_transaction_id is not null and not exists (
    select 1 from public.transactions where id = p_reverses_transaction_id and user_id = v_user_id and status = 'posted'
  ) then
    raise exception using errcode = '23503', message = 'Reversed transaction does not exist for this user';
  end if;

  v_payload := jsonb_build_object(
    'kind', p_kind, 'currency', p_currency, 'occurred_at', p_occurred_at,
    'description', btrim(p_description), 'merchant_or_source', p_merchant_or_source,
    'notes', p_notes, 'data_quality', p_data_quality, 'entries', p_entries,
    'reverses_transaction_id', p_reverses_transaction_id
  );

  if p_idempotency_key is not null then
    select * into v_existing
    from public.transactions
    where user_id = v_user_id and idempotency_key = p_idempotency_key
    for update;
    if found then
      if v_existing.idempotency_payload = v_payload then
        return v_existing.id;
      end if;
      raise exception using errcode = '23505', message = 'Idempotency key was already used with a different command';
    end if;
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    begin
      v_account_id := (v_entry ->> 'account_id')::uuid;
      v_amount := (v_entry ->> 'amount_minor')::bigint;
      v_category_id := nullif(v_entry ->> 'category_id', '')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'Each entry requires valid account_id and integer amount_minor';
    end;

    if v_amount = 0 then
      raise exception using errcode = '23514', message = 'Entry amount cannot be zero';
    end if;

    select * into v_account
    from public.accounts
    where id = v_account_id and user_id = v_user_id and archived_at is null;
    if not found then
      raise exception using errcode = '42501', message = 'Entry account is unavailable or belongs to another user';
    end if;
    if v_account.currency <> p_currency then
      raise exception using errcode = '23514', message = 'All accounts must use the transaction currency';
    end if;
    if v_category_id is not null and not exists (
      select 1 from public.categories where id = v_category_id and user_id = v_user_id and archived_at is null
    ) then
      raise exception using errcode = '42501', message = 'Entry category is unavailable or belongs to another user';
    end if;
    v_sum := v_sum + v_amount::numeric;
  end loop;

  if v_sum <> 0 then
    raise exception using errcode = '23514', message = 'Transaction entries must sum to zero';
  end if;

  insert into public.transactions (
    user_id, kind, status, currency, occurred_at, description, merchant_or_source, notes,
    reverses_transaction_id, data_quality, idempotency_key, idempotency_payload
  ) values (
    v_user_id, p_kind, 'draft', p_currency, p_occurred_at, btrim(p_description), p_merchant_or_source, p_notes,
    p_reverses_transaction_id, p_data_quality, p_idempotency_key, case when p_idempotency_key is null then null else v_payload end
  ) returning id into v_transaction_id;

  insert into public.transaction_entries (user_id, transaction_id, account_id, amount_minor, category_id, memo)
  select v_user_id, v_transaction_id, (value ->> 'account_id')::uuid, (value ->> 'amount_minor')::bigint,
         nullif(value ->> 'category_id', '')::uuid, nullif(value ->> 'memo', '')
  from jsonb_array_elements(p_entries);

  update public.transactions
  set status = 'posted', posted_at = clock_timestamp()
  where id = v_transaction_id;

  return v_transaction_id;
end;
$$;

create function runway_private.post_transfer_impl(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount_minor bigint,
  p_occurred_at timestamptz,
  p_description text,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_source public.accounts%rowtype;
  v_destination public.accounts%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception using errcode = '22023', message = 'Transfer amount must be positive'; end if;
  if p_source_account_id = p_destination_account_id then raise exception using errcode = '22023', message = 'Transfer accounts must differ'; end if;

  select * into v_source from public.accounts where id = p_source_account_id and user_id = v_user_id and archived_at is null;
  select * into v_destination from public.accounts where id = p_destination_account_id and user_id = v_user_id and archived_at is null;
  if v_source.id is null or v_destination.id is null then raise exception using errcode = '42501', message = 'Transfer account is unavailable or belongs to another user'; end if;
  if v_source.class <> 'asset' or v_destination.class <> 'asset' then raise exception using errcode = '23514', message = 'Transfers require asset accounts'; end if;
  if v_source.currency <> v_destination.currency then raise exception using errcode = '23514', message = 'Cross-currency transfers are not supported'; end if;

  return runway_private.post_transaction_impl(
    'transfer', v_source.currency, p_occurred_at, p_description, null, p_notes, 'verified', p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', v_source.id, 'amount_minor', -p_amount_minor),
      jsonb_build_object('account_id', v_destination.id, 'amount_minor', p_amount_minor)
    ), null
  );
end;
$$;

create function runway_private.post_income_impl(
  p_destination_account_id uuid,
  p_amount_minor bigint,
  p_category_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_merchant_or_source text,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_destination public.accounts%rowtype;
  v_income_account_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception using errcode = '22023', message = 'Income amount must be positive'; end if;
  select * into v_destination from public.accounts where id = p_destination_account_id and user_id = v_user_id and archived_at is null;
  if v_destination.id is null or v_destination.class <> 'asset' then raise exception using errcode = '42501', message = 'Destination must be an owned asset account'; end if;
  perform runway_private.ensure_system_accounts_impl(v_user_id, v_destination.currency);
  select id into v_income_account_id from public.accounts
    where user_id = v_user_id and system_key = 'income' and currency = v_destination.currency;
  return runway_private.post_transaction_impl(
    'income', v_destination.currency, p_occurred_at, p_description, p_merchant_or_source, p_notes, 'verified', p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', v_destination.id, 'amount_minor', p_amount_minor),
      jsonb_build_object('account_id', v_income_account_id, 'amount_minor', -p_amount_minor, 'category_id', p_category_id)
    ), null
  );
end;
$$;

create function runway_private.post_expense_impl(
  p_source_account_id uuid,
  p_amount_minor bigint,
  p_category_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_merchant_or_source text,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_source public.accounts%rowtype;
  v_expense_account_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception using errcode = '22023', message = 'Expense amount must be positive'; end if;
  select * into v_source from public.accounts where id = p_source_account_id and user_id = v_user_id and archived_at is null;
  if v_source.id is null or v_source.class <> 'asset' then raise exception using errcode = '42501', message = 'Source must be an owned asset account'; end if;
  perform runway_private.ensure_system_accounts_impl(v_user_id, v_source.currency);
  select id into v_expense_account_id from public.accounts
    where user_id = v_user_id and system_key = 'expense' and currency = v_source.currency;
  return runway_private.post_transaction_impl(
    'expense', v_source.currency, p_occurred_at, p_description, p_merchant_or_source, p_notes, 'verified', p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', v_source.id, 'amount_minor', -p_amount_minor),
      jsonb_build_object('account_id', v_expense_account_id, 'amount_minor', p_amount_minor, 'category_id', p_category_id)
    ), null
  );
end;
$$;

create function runway_private.post_debt_payment_impl(
  p_source_account_id uuid,
  p_liability_account_id uuid,
  p_principal_minor bigint,
  p_occurred_at timestamptz,
  p_description text,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_source public.accounts%rowtype;
  v_liability public.accounts%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_principal_minor is null or p_principal_minor <= 0 then raise exception using errcode = '22023', message = 'Principal amount must be positive'; end if;
  select * into v_source from public.accounts where id = p_source_account_id and user_id = v_user_id and archived_at is null;
  select * into v_liability from public.accounts where id = p_liability_account_id and user_id = v_user_id and archived_at is null;
  if v_source.id is null or v_source.class <> 'asset' or v_liability.id is null or v_liability.class <> 'liability' then
    raise exception using errcode = '42501', message = 'Debt payment requires owned asset and liability accounts';
  end if;
  if v_source.currency <> v_liability.currency then raise exception using errcode = '23514', message = 'Cross-currency debt payments are not supported'; end if;
  return runway_private.post_transaction_impl(
    'debt_payment', v_source.currency, p_occurred_at, p_description, null, p_notes, 'verified', p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', v_source.id, 'amount_minor', -p_principal_minor),
      jsonb_build_object('account_id', v_liability.id, 'amount_minor', p_principal_minor)
    ), null
  );
end;
$$;

create function runway_private.post_opening_balance_impl(
  p_account_id uuid,
  p_balance_minor bigint,
  p_occurred_at timestamptz,
  p_description text,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account public.accounts%rowtype;
  v_equity_account_id uuid;
  v_account_entry bigint;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_balance_minor is null or p_balance_minor <= 0 then raise exception using errcode = '22023', message = 'Opening balance must be positive'; end if;
  select * into v_account from public.accounts where id = p_account_id and user_id = v_user_id and archived_at is null and not is_system;
  if v_account.id is null or v_account.class not in ('asset', 'liability') then raise exception using errcode = '42501', message = 'Opening balance requires an owned asset or liability account'; end if;
  if exists (
    select 1 from public.transaction_entries e join public.transactions t on t.id = e.transaction_id
    where e.account_id = v_account.id and t.status = 'posted'
  ) then
    raise exception using errcode = '55000', message = 'Opening balance is only allowed before other posted activity';
  end if;
  perform runway_private.ensure_system_accounts_impl(v_user_id, v_account.currency);
  select id into v_equity_account_id from public.accounts
    where user_id = v_user_id and system_key = 'opening_equity' and currency = v_account.currency;
  v_account_entry := case when v_account.class = 'asset' then p_balance_minor else -p_balance_minor end;
  return runway_private.post_transaction_impl(
    'opening_balance', v_account.currency, p_occurred_at, p_description, null, p_notes, 'verified', p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', v_account.id, 'amount_minor', v_account_entry),
      jsonb_build_object('account_id', v_equity_account_id, 'amount_minor', -v_account_entry)
    ), null
  );
end;
$$;

create function runway_private.create_account_impl(
  p_name text,
  p_class public.runway_account_class,
  p_subtype public.runway_account_subtype,
  p_currency text,
  p_include_in_net_worth boolean,
  p_liquidity_class public.runway_liquidity_class,
  p_valuation_mode public.runway_valuation_mode,
  p_opened_on date,
  p_opening_balance_minor bigint,
  p_opening_occurred_at timestamptz,
  p_opening_description text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account_id uuid;
  v_existing public.accounts%rowtype;
  v_payload jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_class not in ('asset', 'liability') then raise exception using errcode = '23514', message = 'User-facing accounts must be assets or liabilities'; end if;
  if p_subtype = 'system' then raise exception using errcode = '23514', message = 'System subtype is reserved'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception using errcode = '22023', message = 'A valid ISO currency is required'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception using errcode = '22023', message = 'Account name must contain 1 to 120 characters'; end if;
  if p_idempotency_key is not null and char_length(p_idempotency_key) not between 1 and 120 then raise exception using errcode = '22023', message = 'Account idempotency key must contain 1 to 120 characters'; end if;
  if p_opening_balance_minor is not null and p_opening_balance_minor <= 0 then raise exception using errcode = '22023', message = 'Opening balance must be positive'; end if;
  if (p_opening_balance_minor is null) <> (p_opening_occurred_at is null) then raise exception using errcode = '22023', message = 'Opening amount and occurrence time must be provided together'; end if;

  v_payload := jsonb_build_object(
    'name', btrim(p_name), 'class', p_class, 'subtype', p_subtype, 'currency', p_currency,
    'include_in_net_worth', p_include_in_net_worth, 'liquidity_class', p_liquidity_class,
    'valuation_mode', p_valuation_mode, 'opened_on', p_opened_on,
    'opening_balance_minor', p_opening_balance_minor, 'opening_occurred_at', p_opening_occurred_at,
    'opening_description', p_opening_description
  );

  if p_idempotency_key is not null then
    select * into v_existing from public.accounts
    where user_id = v_user_id and creation_idempotency_key = p_idempotency_key
    for update;
    if found then
      if v_existing.creation_payload = v_payload then return v_existing.id; end if;
      raise exception using errcode = '23505', message = 'Account idempotency key was already used with a different command';
    end if;
  end if;

  insert into public.accounts (
    user_id, name, class, subtype, currency, include_in_net_worth, liquidity_class,
    valuation_mode, opened_on, creation_idempotency_key, creation_payload
  ) values (
    v_user_id, btrim(p_name), p_class, p_subtype, p_currency, p_include_in_net_worth,
    p_liquidity_class, p_valuation_mode, p_opened_on, p_idempotency_key,
    case when p_idempotency_key is null then null else v_payload end
  ) returning id into v_account_id;

  if p_opening_balance_minor is not null then
    perform runway_private.post_opening_balance_impl(
      v_account_id, p_opening_balance_minor, p_opening_occurred_at,
      coalesce(nullif(btrim(p_opening_description), ''), 'Opening balance'), null,
      case when p_idempotency_key is null then null else p_idempotency_key || ':opening' end
    );
  end if;
  return v_account_id;
end;
$$;

create function runway_private.reverse_transaction_impl(
  p_transaction_id uuid,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_original public.transactions%rowtype;
  v_existing public.transactions%rowtype;
  v_entries jsonb;
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
    where id = p_transaction_id and user_id = v_user_id and status = 'posted'
    for update;
  if not found then raise exception using errcode = '42501', message = 'Posted transaction is unavailable or belongs to another user'; end if;
  if v_original.reverses_transaction_id is not null then raise exception using errcode = '55000', message = 'A reversal cannot itself be reversed in Phase 2'; end if;
  if exists (select 1 from public.transactions where user_id = v_user_id and reverses_transaction_id = p_transaction_id) then
    raise exception using errcode = '23505', message = 'Transaction was already reversed';
  end if;
  select jsonb_agg(jsonb_build_object(
    'account_id', account_id, 'amount_minor', -amount_minor,
    'category_id', category_id, 'memo', case when memo is null then null else 'Reversal: ' || memo end
  ) order by id) into v_entries
  from public.transaction_entries where transaction_id = p_transaction_id;
  return runway_private.post_transaction_impl(
    v_original.kind, v_original.currency, p_occurred_at, 'Reversal: ' || v_original.description,
    v_original.merchant_or_source, p_notes, v_original.data_quality, p_idempotency_key, v_entries, v_original.id
  );
end;
$$;

create function public.post_transaction(
  p_kind public.runway_transaction_kind, p_currency text, p_occurred_at timestamptz, p_description text,
  p_merchant_or_source text, p_notes text, p_data_quality public.runway_data_quality,
  p_idempotency_key text, p_entries jsonb
)
returns uuid language sql security invoker set search_path = ''
as $$ select runway_private.post_transaction_impl($1,$2,$3,$4,$5,$6,$7,$8,$9,null) $$;

create function public.post_transfer(
  p_source_account_id uuid, p_destination_account_id uuid, p_amount_minor bigint, p_occurred_at timestamptz,
  p_description text, p_notes text, p_idempotency_key text
)
returns uuid language sql security invoker set search_path = ''
as $$ select runway_private.post_transfer_impl($1,$2,$3,$4,$5,$6,$7) $$;

create function public.post_income(
  p_destination_account_id uuid, p_amount_minor bigint, p_category_id uuid, p_occurred_at timestamptz,
  p_description text, p_merchant_or_source text, p_notes text, p_idempotency_key text
)
returns uuid language sql security invoker set search_path = ''
as $$ select runway_private.post_income_impl($1,$2,$3,$4,$5,$6,$7,$8) $$;

create function public.post_expense(
  p_source_account_id uuid, p_amount_minor bigint, p_category_id uuid, p_occurred_at timestamptz,
  p_description text, p_merchant_or_source text, p_notes text, p_idempotency_key text
)
returns uuid language sql security invoker set search_path = ''
as $$ select runway_private.post_expense_impl($1,$2,$3,$4,$5,$6,$7,$8) $$;

create function public.post_debt_payment(
  p_source_account_id uuid, p_liability_account_id uuid, p_principal_minor bigint, p_occurred_at timestamptz,
  p_description text, p_notes text, p_idempotency_key text
)
returns uuid language sql security invoker set search_path = ''
as $$ select runway_private.post_debt_payment_impl($1,$2,$3,$4,$5,$6,$7) $$;

create function public.post_opening_balance(
  p_account_id uuid, p_balance_minor bigint, p_occurred_at timestamptz,
  p_description text, p_notes text, p_idempotency_key text
)
returns uuid language sql security invoker set search_path = ''
as $$ select runway_private.post_opening_balance_impl($1,$2,$3,$4,$5,$6) $$;

create function public.create_account(
  p_name text, p_class public.runway_account_class, p_subtype public.runway_account_subtype,
  p_currency text, p_include_in_net_worth boolean, p_liquidity_class public.runway_liquidity_class,
  p_valuation_mode public.runway_valuation_mode, p_opened_on date, p_opening_balance_minor bigint,
  p_opening_occurred_at timestamptz, p_opening_description text, p_idempotency_key text
)
returns uuid language sql security invoker set search_path = ''
as $$ select runway_private.create_account_impl($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) $$;

create function public.reverse_transaction(
  p_transaction_id uuid, p_occurred_at timestamptz, p_notes text, p_idempotency_key text
)
returns uuid language sql security invoker set search_path = ''
as $$ select runway_private.reverse_transaction_impl($1,$2,$3,$4) $$;

create view public.account_balances
with (security_invoker = true)
as
select
  a.user_id,
  a.id as account_id,
  a.currency,
  a.class,
  coalesce(sum(e.amount_minor) filter (where t.status = 'posted'), 0)::bigint as ledger_balance_minor,
  case
    when a.class in ('asset', 'expense') then coalesce(sum(e.amount_minor) filter (where t.status = 'posted'), 0)::bigint
    else -coalesce(sum(e.amount_minor) filter (where t.status = 'posted'), 0)::bigint
  end as display_balance_minor
from public.accounts a
left join public.transaction_entries e on e.account_id = a.id and e.user_id = a.user_id
left join public.transactions t on t.id = e.transaction_id and t.user_id = a.user_id
group by a.user_id, a.id, a.currency, a.class;

create view public.current_net_worth
with (security_invoker = true)
as
select
  b.user_id,
  b.currency,
  coalesce(sum(b.display_balance_minor) filter (where b.class = 'asset' and a.include_in_net_worth and not a.is_system), 0)::bigint as total_assets_minor,
  coalesce(sum(b.display_balance_minor) filter (where b.class = 'liability' and a.include_in_net_worth and not a.is_system), 0)::bigint as total_liabilities_minor,
  (
    coalesce(sum(b.display_balance_minor) filter (where b.class = 'asset' and a.include_in_net_worth and not a.is_system), 0)
    - coalesce(sum(b.display_balance_minor) filter (where b.class = 'liability' and a.include_in_net_worth and not a.is_system), 0)
  )::bigint as net_worth_minor
from public.account_balances b
join public.accounts a on a.id = b.account_id and a.user_id = b.user_id
group by b.user_id, b.currency;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;
alter table public.account_balance_snapshots enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy accounts_select_own on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy accounts_update_own_non_system on public.accounts for update to authenticated
  using ((select auth.uid()) = user_id and not is_system)
  with check ((select auth.uid()) = user_id and not is_system);

create policy categories_select_own on public.categories for select to authenticated using ((select auth.uid()) = user_id);
create policy categories_insert_own on public.categories for insert to authenticated with check ((select auth.uid()) = user_id and not is_system);
create policy categories_update_own_non_system on public.categories for update to authenticated
  using ((select auth.uid()) = user_id and not is_system)
  with check ((select auth.uid()) = user_id and not is_system);

create policy transactions_select_own on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy transaction_entries_select_own on public.transaction_entries for select to authenticated using ((select auth.uid()) = user_id);

create policy account_snapshots_select_own on public.account_balance_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy account_snapshots_insert_own on public.account_balance_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.accounts, public.categories, public.transactions,
  public.transaction_entries, public.account_balance_snapshots from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, update on public.accounts to authenticated;
grant select, insert, update on public.categories to authenticated;
grant select on public.transactions, public.transaction_entries to authenticated;
grant select, insert on public.account_balance_snapshots to authenticated;
grant select on public.account_balances, public.current_net_worth to authenticated;

revoke all on all functions in schema runway_private from public, anon, authenticated;
grant usage on schema runway_private to authenticated;
grant execute on function runway_private.post_transaction_impl(public.runway_transaction_kind,text,timestamptz,text,text,text,public.runway_data_quality,text,jsonb,uuid) to authenticated;
grant execute on function runway_private.post_transfer_impl(uuid,uuid,bigint,timestamptz,text,text,text) to authenticated;
grant execute on function runway_private.post_income_impl(uuid,bigint,uuid,timestamptz,text,text,text,text) to authenticated;
grant execute on function runway_private.post_expense_impl(uuid,bigint,uuid,timestamptz,text,text,text,text) to authenticated;
grant execute on function runway_private.post_debt_payment_impl(uuid,uuid,bigint,timestamptz,text,text,text) to authenticated;
grant execute on function runway_private.post_opening_balance_impl(uuid,bigint,timestamptz,text,text,text) to authenticated;
grant execute on function runway_private.create_account_impl(text,public.runway_account_class,public.runway_account_subtype,text,boolean,public.runway_liquidity_class,public.runway_valuation_mode,date,bigint,timestamptz,text,text) to authenticated;
grant execute on function runway_private.reverse_transaction_impl(uuid,timestamptz,text,text) to authenticated;

revoke execute on function public.post_transaction(public.runway_transaction_kind,text,timestamptz,text,text,text,public.runway_data_quality,text,jsonb) from public, anon;
revoke execute on function public.post_transfer(uuid,uuid,bigint,timestamptz,text,text,text) from public, anon;
revoke execute on function public.post_income(uuid,bigint,uuid,timestamptz,text,text,text,text) from public, anon;
revoke execute on function public.post_expense(uuid,bigint,uuid,timestamptz,text,text,text,text) from public, anon;
revoke execute on function public.post_debt_payment(uuid,uuid,bigint,timestamptz,text,text,text) from public, anon;
revoke execute on function public.post_opening_balance(uuid,bigint,timestamptz,text,text,text) from public, anon;
revoke execute on function public.create_account(text,public.runway_account_class,public.runway_account_subtype,text,boolean,public.runway_liquidity_class,public.runway_valuation_mode,date,bigint,timestamptz,text,text) from public, anon;
revoke execute on function public.reverse_transaction(uuid,timestamptz,text,text) from public, anon;

grant execute on function public.post_transaction(public.runway_transaction_kind,text,timestamptz,text,text,text,public.runway_data_quality,text,jsonb) to authenticated;
grant execute on function public.post_transfer(uuid,uuid,bigint,timestamptz,text,text,text) to authenticated;
grant execute on function public.post_income(uuid,bigint,uuid,timestamptz,text,text,text,text) to authenticated;
grant execute on function public.post_expense(uuid,bigint,uuid,timestamptz,text,text,text,text) to authenticated;
grant execute on function public.post_debt_payment(uuid,uuid,bigint,timestamptz,text,text,text) to authenticated;
grant execute on function public.post_opening_balance(uuid,bigint,timestamptz,text,text,text) to authenticated;
grant execute on function public.create_account(text,public.runway_account_class,public.runway_account_subtype,text,boolean,public.runway_liquidity_class,public.runway_valuation_mode,date,bigint,timestamptz,text,text) to authenticated;
grant execute on function public.reverse_transaction(uuid,timestamptz,text,text) to authenticated;
