create type public.runway_forecast_kind as enum ('income', 'expense');
create type public.runway_forecast_status as enum ('expected', 'skipped', 'realized');
create type public.runway_forecast_confidence as enum ('low', 'medium', 'high');

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  legacy_source_id text,
  migration_metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint scenarios_id_user_unique unique (id, user_id),
  constraint scenarios_legacy_source_unique unique (user_id, legacy_source_id),
  constraint scenarios_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint scenarios_description_length check (description is null or char_length(description) <= 2000)
);

create table public.forecast_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.runway_forecast_kind not null,
  expected_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  source_account_id uuid,
  destination_account_id uuid,
  category_id uuid,
  label text not null,
  notes text,
  confidence public.runway_forecast_confidence not null default 'medium',
  status public.runway_forecast_status not null default 'expected',
  scenario_id uuid,
  legacy_source_id text,
  original_signed_amount numeric,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint forecast_items_id_user_unique unique (id, user_id),
  constraint forecast_items_source_account_owner_fkey foreign key (source_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint forecast_items_destination_account_owner_fkey foreign key (destination_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint forecast_items_category_owner_fkey foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete restrict,
  constraint forecast_items_scenario_owner_fkey foreign key (scenario_id, user_id)
    references public.scenarios (id, user_id) on delete restrict,
  constraint forecast_items_legacy_source_unique unique (user_id, legacy_source_id),
  constraint forecast_items_label_length check (char_length(btrim(label)) between 1 and 240),
  constraint forecast_items_notes_length check (notes is null or char_length(notes) <= 4000),
  constraint forecast_items_account_shape check (
    (kind = 'income' and source_account_id is null and destination_account_id is not null)
    or (kind = 'expense' and source_account_id is not null and destination_account_id is null)
  )
);

create table public.legacy_history_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null,
  source_path text not null,
  legacy_source_id text,
  occurred_on date,
  label text not null,
  planned_amount_minor bigint,
  actual_amount_minor bigint,
  category_name text,
  classification text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint legacy_history_items_source_unique unique (user_id, source_type, source_path),
  constraint legacy_history_items_label_length check (char_length(btrim(label)) between 1 and 240)
);

create table public.legacy_budget_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  budget_month date not null,
  bucket_name text not null,
  budgeted_minor bigint not null,
  spend_minor bigint not null,
  variance_minor bigint generated always as (budgeted_minor - spend_minor) stored,
  was_active boolean,
  created_at timestamptz not null default clock_timestamp(),
  constraint legacy_budget_history_month_bucket_unique unique (user_id, budget_month, bucket_name),
  constraint legacy_budget_history_month_start check (extract(day from budget_month) = 1),
  constraint legacy_budget_history_name_length check (char_length(btrim(bucket_name)) between 1 and 120)
);

create table runway_migration.application_records (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null unique references runway_migration.migration_runs (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null,
  operating_account_id uuid not null,
  opening_transaction_id uuid not null,
  forecast_count integer not null check (forecast_count >= 0),
  settled_history_count integer not null check (settled_history_count >= 0),
  excluded_overdue_count integer not null check (excluded_overdue_count >= 0),
  scenario_count integer not null check (scenario_count >= 0),
  template_reference_count integer not null check (template_reference_count >= 0),
  lineage_hint_count integer not null check (lineage_hint_count >= 0),
  bucket_history_count integer not null check (bucket_history_count >= 0),
  verification jsonb not null,
  constraint application_records_user_run_unique unique (user_id, migration_run_id),
  constraint application_records_account_owner_fkey foreign key (operating_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint application_records_transaction_owner_fkey foreign key (opening_transaction_id, user_id)
    references public.transactions (id, user_id) on delete restrict
);

create index scenarios_user_active_idx on public.scenarios (user_id, name) where archived_at is null;
create index forecast_items_user_status_date_idx on public.forecast_items (user_id, status, expected_date);
create index forecast_items_scenario_idx on public.forecast_items (scenario_id) where scenario_id is not null;
create index forecast_items_source_account_idx on public.forecast_items (source_account_id) where source_account_id is not null;
create index forecast_items_destination_account_idx on public.forecast_items (destination_account_id) where destination_account_id is not null;
create index forecast_items_category_idx on public.forecast_items (category_id) where category_id is not null;
create index legacy_history_items_user_date_idx on public.legacy_history_items (user_id, occurred_on desc);
create index legacy_budget_history_user_month_idx on public.legacy_budget_history (user_id, budget_month desc);
create index application_records_user_applied_idx on runway_migration.application_records (user_id, applied_at desc);

create trigger scenarios_set_updated_at before update on public.scenarios
for each row execute function runway_private.set_updated_at();
create trigger forecast_items_set_updated_at before update on public.forecast_items
for each row execute function runway_private.set_updated_at();

alter table public.scenarios enable row level security;
alter table public.forecast_items enable row level security;
alter table public.legacy_history_items enable row level security;
alter table public.legacy_budget_history enable row level security;
alter table runway_migration.application_records enable row level security;

create policy scenarios_select_own on public.scenarios for select to authenticated
  using ((select auth.uid()) = user_id);
create policy scenarios_insert_own on public.scenarios for insert to authenticated
  with check ((select auth.uid()) = user_id and legacy_source_id is null);
create policy scenarios_update_own on public.scenarios for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy forecast_items_select_own on public.forecast_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy forecast_items_insert_own on public.forecast_items for insert to authenticated
  with check ((select auth.uid()) = user_id and legacy_source_id is null);
create policy forecast_items_update_own on public.forecast_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy forecast_items_delete_own on public.forecast_items for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy legacy_history_items_select_own on public.legacy_history_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy legacy_budget_history_select_own on public.legacy_budget_history for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.scenarios, public.forecast_items, public.legacy_history_items,
  public.legacy_budget_history from anon, authenticated;
grant select, insert, update on public.scenarios to authenticated;
grant select, insert, update, delete on public.forecast_items to authenticated;
grant select on public.legacy_history_items, public.legacy_budget_history to authenticated;

revoke all on runway_migration.application_records from public, anon, authenticated;

create function runway_private.reconcile_account_impl(
  p_account_id uuid,
  p_observed_balance_minor bigint,
  p_observed_at timestamptz,
  p_notes text,
  p_create_adjustment boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_account public.accounts%rowtype;
  v_ledger_balance bigint;
  v_display_balance bigint;
  v_target_ledger bigint;
  v_difference bigint;
  v_adjustments_account_id uuid;
  v_transaction_id uuid;
  v_snapshot_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_observed_at is null then raise exception using errcode = '22023', message = 'Observed time is required'; end if;
  if p_observed_balance_minor is null then raise exception using errcode = '22023', message = 'Observed balance is required'; end if;
  select * into v_account from public.accounts
    where id = p_account_id and user_id = v_user_id and not is_system and archived_at is null;
  if not found then raise exception using errcode = '42501', message = 'Account is unavailable or belongs to another user'; end if;

  select ledger_balance_minor, display_balance_minor into v_ledger_balance, v_display_balance
  from public.account_balances where account_id = v_account.id and user_id = v_user_id;
  v_target_ledger := case when v_account.class = 'liability' then -p_observed_balance_minor else p_observed_balance_minor end;
  v_difference := v_target_ledger - coalesce(v_ledger_balance, 0);

  if p_create_adjustment and v_difference <> 0 then
    if char_length(coalesce(p_idempotency_key, '')) not between 1 and 128 then
      raise exception using errcode = '22023', message = 'An idempotency key is required for an adjustment';
    end if;
    perform runway_private.ensure_system_accounts_impl(v_user_id, v_account.currency);
    select id into v_adjustments_account_id from public.accounts
      where user_id = v_user_id and system_key = 'adjustments' and currency = v_account.currency;
    v_transaction_id := runway_private.post_transaction_impl(
      'adjustment', v_account.currency, p_observed_at, 'Balance reconciliation', null, p_notes,
      'verified', p_idempotency_key,
      jsonb_build_array(
        jsonb_build_object('account_id', v_account.id, 'amount_minor', v_difference),
        jsonb_build_object('account_id', v_adjustments_account_id, 'amount_minor', -v_difference)
      ), null
    );
  end if;

  insert into public.account_balance_snapshots (
    user_id, account_id, observed_at, balance_minor, source, notes, reconciliation_transaction_id
  ) values (
    v_user_id, v_account.id, p_observed_at, p_observed_balance_minor, 'manual', p_notes, v_transaction_id
  ) returning id into v_snapshot_id;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'ledger_balance_minor', v_display_balance,
    'observed_balance_minor', p_observed_balance_minor,
    'difference_minor', p_observed_balance_minor - coalesce(v_display_balance, 0),
    'adjustment_transaction_id', v_transaction_id
  );
end;
$$;

create function public.reconcile_account(
  p_account_id uuid,
  p_observed_balance_minor bigint,
  p_observed_at timestamptz,
  p_notes text,
  p_create_adjustment boolean,
  p_idempotency_key text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select runway_private.reconcile_account_impl($1,$2,$3,$4,$5,$6) $$;

revoke execute on function runway_private.reconcile_account_impl(uuid,bigint,timestamptz,text,boolean,text)
  from public, anon;
grant execute on function runway_private.reconcile_account_impl(uuid,bigint,timestamptz,text,boolean,text)
  to authenticated;
revoke execute on function public.reconcile_account(uuid,bigint,timestamptz,text,boolean,text)
  from public, anon;
grant execute on function public.reconcile_account(uuid,bigint,timestamptz,text,boolean,text)
  to authenticated;

create function runway_migration.apply_phase4_cutover(
  p_user_id uuid,
  p_expected_email text,
  p_expected_live_checksum text,
  p_source_checksum text,
  p_source_updated_at timestamptz,
  p_migration_run_id uuid,
  p_cutover_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_backup_id uuid;
  v_account_id uuid;
  v_opening_transaction_id uuid;
  v_application runway_migration.application_records%rowtype;
  v_forecast_count integer;
  v_settled_count integer;
  v_overdue_count integer;
  v_scenario_count integer;
  v_template_count integer;
  v_lineage_count integer;
  v_bucket_count integer;
  v_balance bigint;
  v_net_worth bigint;
  v_applied_at timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_expected_email is null or p_migration_run_id is null then
    raise exception using errcode = '22023', message = 'Owner identity and migration run are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':phase4-cutover', 0));

  select * into v_application from runway_migration.application_records
    where migration_run_id = p_migration_run_id and user_id = p_user_id;
  if found then
    return jsonb_build_object(
      'operating_account_id', v_application.operating_account_id,
      'opening_transaction_id', v_application.opening_transaction_id,
      'forecast_count', v_application.forecast_count,
      'already_applied', true
    );
  end if;

  if not exists (
    select 1 from auth.users where id = p_user_id and lower(email) = lower(p_expected_email)
  ) then
    raise exception using errcode = '42501', message = 'Auth owner identity does not match the approved cutover';
  end if;

  select state into v_state from public.runway_state
    where user_id = p_user_id and updated_at = p_source_updated_at;
  if v_state is null then
    raise exception using errcode = '55000', message = 'Approved legacy source row or timestamp changed';
  end if;
  if encode(extensions.digest(v_state::text, 'sha256'), 'hex') <> p_expected_live_checksum then
    raise exception using errcode = '55000', message = 'Approved legacy source checksum changed';
  end if;
  if (v_state #>> '{account,currentBalance}')::numeric <> 11956
    or (v_state #>> '{account,warningThreshold}')::numeric <> 9000 then
    raise exception using errcode = '55000', message = 'Approved opening balance or operating floor changed';
  end if;
  if p_source_checksum !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Approved export checksum is invalid';
  end if;

  insert into runway_migration.legacy_state_backups (
    id, user_id, source_updated_at, source_checksum, state_json, captured_at
  ) values (
    gen_random_uuid(), p_user_id, p_source_updated_at, p_source_checksum, v_state, v_applied_at
  ) on conflict (user_id, source_checksum) do nothing;
  select id into strict v_backup_id from runway_migration.legacy_state_backups
    where user_id = p_user_id and source_checksum = p_source_checksum;

  insert into runway_migration.migration_runs (
    id, user_id, backup_id, source_checksum, source_updated_at, target_schema_version,
    status, started_at, importer_version, summary, verification_status, notes
  ) values (
    p_migration_run_id, p_user_id, v_backup_id, p_source_checksum, p_source_updated_at,
    'normalized-v1', 'prepared', v_applied_at, 'runway-legacy-importer-v1', '{}'::jsonb,
    'pending', 'Phase 4 authoritative cutover in progress'
  ) on conflict (id) do nothing;

  insert into public.profiles (user_id, base_currency, timezone, operating_floor_minor, schema_version)
  values (p_user_id, 'NOK', 'Europe/Oslo', 900000, 1)
  on conflict (user_id) do nothing;
  if not exists (
    select 1 from public.profiles where user_id = p_user_id and base_currency = 'NOK'
      and timezone = 'Europe/Oslo' and operating_floor_minor = 900000
  ) then
    raise exception using errcode = '55000', message = 'Existing profile conflicts with the approved baseline';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  v_account_id := runway_private.create_account_impl(
    'Operating Cash', 'asset', 'checking', 'NOK', true, 'operating', 'ledger',
    p_cutover_date, null, null, null,
    'phase4:' || p_migration_run_id::text || ':operating-account'
  );
  v_opening_transaction_id := runway_private.post_opening_balance_impl(
    v_account_id, 1195600, p_source_updated_at,
    'Runway 2 cutover opening balance',
    'Authoritative opening state from migration run ' || p_migration_run_id::text ||
      ', source checksum ' || p_source_checksum,
    'phase4:' || p_migration_run_id::text || ':opening-balance'
  );

  select display_balance_minor into v_balance from public.account_balances
    where account_id = v_account_id and user_id = p_user_id;
  select net_worth_minor into v_net_worth from public.current_net_worth
    where user_id = p_user_id and currency = 'NOK';
  if v_balance <> 1195600 or v_net_worth <> 1195600 then
    raise exception using errcode = '23514', message = 'Opening balance reconciliation failed';
  end if;

  insert into public.categories (user_id, name, kind, sort_order)
  select p_user_id, x.name, x.kind::public.runway_category_kind, x.sort_order
  from (values
    ('Income', 'income', 10), ('Housing', 'expense', 20), ('Groceries', 'expense', 30),
    ('Bills', 'expense', 40), ('Travel', 'expense', 50), ('Miscellaneous', 'expense', 60)
  ) as x(name, kind, sort_order)
  where not exists (
    select 1 from public.categories c where c.user_id = p_user_id
      and c.kind = x.kind::public.runway_category_kind and lower(c.name) = lower(x.name)
      and c.archived_at is null
  );

  insert into public.scenarios (user_id, name, description, legacy_source_id, migration_metadata)
  select p_user_id, btrim(s.value ->> 'name'), nullif(s.value ->> 'description', ''),
    s.value ->> 'id', jsonb_build_object('legacy_is_included', s.value -> 'isIncluded', 'canonical_base_plan_changed', false)
  from jsonb_array_elements(coalesce(v_state -> 'scenarios', '[]'::jsonb)) s(value)
  on conflict (user_id, legacy_source_id) do nothing;
  get diagnostics v_scenario_count = row_count;

  insert into public.forecast_items (
    user_id, kind, expected_date, amount_minor, source_account_id, destination_account_id,
    category_id, label, notes, confidence, status, scenario_id, legacy_source_id, original_signed_amount
  )
  select
    p_user_id,
    case when (e.value ->> 'amount')::numeric > 0 then 'income'::public.runway_forecast_kind else 'expense'::public.runway_forecast_kind end,
    (e.value ->> 'date')::date,
    abs(((e.value ->> 'amount')::numeric * 100)::bigint),
    case when (e.value ->> 'amount')::numeric < 0 then v_account_id else null end,
    case when (e.value ->> 'amount')::numeric > 0 then v_account_id else null end,
    c.id,
    btrim(e.value ->> 'label'),
    nullif(e.value ->> 'notes', ''),
    'medium', 'expected', sc.id, e.value ->> 'id', (e.value ->> 'amount')::numeric
  from jsonb_array_elements(coalesce(v_state -> 'events', '[]'::jsonb)) with ordinality e(value, ordinal)
  left join public.categories c on c.user_id = p_user_id and c.archived_at is null and c.name =
    case e.value ->> 'category' when 'Misc' then 'Miscellaneous' else e.value ->> 'category' end
  left join public.scenarios sc on sc.user_id = p_user_id and sc.legacy_source_id = nullif(e.value ->> 'scenarioId', '')
  where coalesce((e.value ->> 'isSettled')::boolean, false) = false
    and (e.value ->> 'date')::date >= p_cutover_date
    and (e.value ->> 'amount')::numeric <> 0
  on conflict (user_id, legacy_source_id) do nothing;
  get diagnostics v_forecast_count = row_count;

  insert into public.legacy_history_items (
    user_id, source_type, source_path, legacy_source_id, occurred_on, label,
    planned_amount_minor, actual_amount_minor, category_name, classification, metadata
  )
  select p_user_id, 'event', 'events[' || (e.ordinal - 1)::text || ']', e.value ->> 'id',
    (e.value ->> 'date')::date, btrim(e.value ->> 'label'),
    ((e.value ->> 'amount')::numeric * 100)::bigint,
    case when e.value ->> 'actualAmount' is null then null else ((e.value ->> 'actualAmount')::numeric * 100)::bigint end,
    e.value ->> 'category',
    case when (e.value ->> 'isSettled')::boolean then 'settled_historical_planned_amount_only'
      else 'historical_reference_resolved_overdue' end,
    jsonb_build_object('legacy_settled', e.value -> 'isSettled', 'scenario_id', e.value -> 'scenarioId',
      'excluded_from_ledger', true, 'excluded_from_active_forecast', not (e.value ->> 'isSettled')::boolean)
  from jsonb_array_elements(coalesce(v_state -> 'events', '[]'::jsonb)) with ordinality e(value, ordinal)
  where (e.value ->> 'isSettled')::boolean = true
    or ((e.value ->> 'isSettled')::boolean = false and (e.value ->> 'date')::date < p_cutover_date)
  on conflict (user_id, source_type, source_path) do nothing;

  select count(*) filter (where classification = 'settled_historical_planned_amount_only'),
    count(*) filter (where classification = 'historical_reference_resolved_overdue')
    into v_settled_count, v_overdue_count
  from public.legacy_history_items where user_id = p_user_id and source_type = 'event';

  insert into public.legacy_history_items (
    user_id, source_type, source_path, legacy_source_id, label, classification, metadata
  )
  select p_user_id, 'template', 'templates[' || (t.ordinal - 1)::text || ']', t.value ->> 'id',
    btrim(t.value ->> 'label'),
    case when t.value ->> 'type' = 'recurring' then 'finite_recurring_reference' else 'quick_entry_preset_reference' end,
    jsonb_build_object('template_type', t.value -> 'type', 'finite_range_preserved', t.value ->> 'type' = 'recurring',
      'start_month', t.value -> 'startMonth', 'end_month', t.value -> 'endMonth',
      'item_count', jsonb_array_length(coalesce(t.value -> 'items', '[]'::jsonb)), 'continued_indefinitely', false)
  from jsonb_array_elements(coalesce(v_state -> 'templates', '[]'::jsonb)) with ordinality t(value, ordinal)
  on conflict (user_id, source_type, source_path) do nothing;
  get diagnostics v_template_count = row_count;

  insert into public.legacy_history_items (
    user_id, source_type, source_path, legacy_source_id, occurred_on, label,
    planned_amount_minor, category_name, classification, metadata
  )
  select p_user_id, 'template_lineage_hint',
    'template_lineage[' || (t.ordinal - 1)::text || '][' || (e.ordinal - 1)::text || ']',
    e.value ->> 'id', (e.value ->> 'date')::date, btrim(e.value ->> 'label'),
    ((e.value ->> 'amount')::numeric * 100)::bigint, e.value ->> 'category',
    'possible_materialized_recurring_event',
    jsonb_build_object('template_legacy_id', t.value -> 'id', 'auto_deduplicated', false)
  from jsonb_array_elements(coalesce(v_state -> 'templates', '[]'::jsonb)) with ordinality t(value, ordinal)
  cross join jsonb_array_elements(coalesce(v_state -> 'events', '[]'::jsonb)) with ordinality e(value, ordinal)
  where t.value ->> 'type' = 'recurring'
    and length(btrim(t.value ->> 'label')) > 0
    and lower(coalesce(e.value ->> 'notes', '')) like '%' || lower(btrim(t.value ->> 'label')) || '%'
  on conflict (user_id, source_type, source_path) do nothing;
  get diagnostics v_lineage_count = row_count;

  insert into public.legacy_budget_history (
    user_id, budget_month, bucket_name, budgeted_minor, spend_minor, was_active
  )
  select p_user_id, (month_entry.key || '-01')::date, bucket_entry.key,
    ((bucket_entry.value ->> 'budgeted')::numeric * 100)::bigint,
    coalesce((select sum(((entry.value ->> 'amount')::numeric * 100)::bigint)
      from jsonb_array_elements(coalesce(bucket_entry.value -> 'entries', '[]'::jsonb)) entry(value)), 0),
    (bucket_entry.value ->> 'isActive')::boolean
  from jsonb_each(coalesce(v_state -> 'buckets', '{}'::jsonb)) month_entry
  cross join lateral jsonb_each(month_entry.value) bucket_entry
  on conflict (user_id, budget_month, bucket_name) do nothing;
  get diagnostics v_bucket_count = row_count;

  insert into runway_migration.application_records (
    migration_run_id, user_id, source_checksum, applied_at, operating_account_id,
    opening_transaction_id, forecast_count, settled_history_count, excluded_overdue_count,
    scenario_count, template_reference_count, lineage_hint_count, bucket_history_count, verification
  ) values (
    p_migration_run_id, p_user_id, p_source_checksum, v_applied_at, v_account_id,
    v_opening_transaction_id, v_forecast_count, v_settled_count, v_overdue_count,
    v_scenario_count, v_template_count, v_lineage_count, v_bucket_count,
    jsonb_build_object('opening_balance_minor', v_balance, 'net_worth_minor', v_net_worth,
      'settled_ledger_transactions', 0, 'source_live_checksum', p_expected_live_checksum,
      'bucket_entries_unresolved', 31, 'legacy_row_mutated', false)
  );

  update runway_migration.migration_runs set
    status = 'applied', completed_at = v_applied_at, verification_status = 'passed',
    notes = 'Phase 4 authoritative opening baseline applied; Runway 2 ledger is authoritative for new actual activity',
    summary = jsonb_build_object(
      'operating_account_id', v_account_id, 'opening_transaction_id', v_opening_transaction_id,
      'forecast_count', v_forecast_count, 'settled_history_count', v_settled_count,
      'excluded_overdue_count', v_overdue_count, 'scenario_count', v_scenario_count,
      'template_reference_count', v_template_count, 'lineage_hint_count', v_lineage_count,
      'bucket_history_count', v_bucket_count, 'opening_balance_minor', v_balance,
      'net_worth_minor', v_net_worth
    )
  where id = p_migration_run_id and user_id = p_user_id;

  return jsonb_build_object(
    'operating_account_id', v_account_id,
    'opening_transaction_id', v_opening_transaction_id,
    'forecast_count', v_forecast_count,
    'historical_settled_count', v_settled_count,
    'excluded_overdue_count', v_overdue_count,
    'scenario_count', v_scenario_count,
    'already_applied', false
  );
end;
$$;

revoke all on function runway_migration.apply_phase4_cutover(uuid,text,text,text,timestamptz,uuid,date)
  from public, anon, authenticated, service_role;

alter default privileges in schema runway_migration
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema runway_migration
  revoke all on functions from public, anon, authenticated;
