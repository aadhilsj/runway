-- Runway 2 Phase 7: non-destructive Plans, typed assumptions, and guarded promotion.
-- Existing scenarios are upgraded in place. No Plan is applied by this migration.

alter table public.scenarios
  add column status text not null default 'active' check (status in ('draft','active','archived','applied')),
  add column start_on date,
  add column end_on date,
  add column comparison_enabled boolean not null default false,
  add column applied_at timestamptz,
  add constraint scenarios_date_order check (end_on is null or start_on is null or end_on >= start_on);
update public.scenarios set status=case when archived_at is null then 'active' else 'archived' end;

create table public.scenario_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid not null,
  change_type text not null check(change_type in(
    'add_one_off_income','add_one_off_expense','add_one_off_transfer','modify_forecast_item','suppress_forecast_item',
    'modify_recurring_rule','pause_recurring_rule','add_temporary_recurring_rule','modify_fund_contribution',
    'pause_fund_contribution','modify_payday_item','modify_goal','modify_operating_floor','modify_safety_window',
    'modify_income_reliability'
  )),
  target_forecast_item_id uuid,
  target_recurring_rule_id uuid,
  target_allocation_item_id uuid,
  target_goal_id uuid,
  source_account_id uuid,
  destination_account_id uuid,
  category_id uuid,
  fund_id uuid,
  effective_on date,
  effective_until date,
  amount_minor bigint check(amount_minor is null or amount_minor >= 0),
  label text,
  confidence public.runway_planned_confidence,
  target_field text check(target_field is null or target_field in('target','preferred','cap','contribution','active','reliability')),
  boolean_value boolean,
  frequency public.runway_recurrence_frequency,
  interval_count integer check(interval_count is null or interval_count between 1 and 120),
  day_of_month integer check(day_of_month is null or day_of_month between 1 and 31),
  day_of_week integer check(day_of_week is null or day_of_week between 0 and 6),
  payload_json jsonb not null default '{}'::jsonb check(jsonb_typeof(payload_json)='object'),
  sort_order integer not null default 0 check(sort_order >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint scenario_changes_id_user_unique unique(id,user_id),
  constraint scenario_changes_scenario_owner_fkey foreign key(scenario_id,user_id) references public.scenarios(id,user_id) on delete cascade,
  constraint scenario_changes_forecast_owner_fkey foreign key(target_forecast_item_id,user_id) references public.forecast_items(id,user_id) on delete restrict,
  constraint scenario_changes_rule_owner_fkey foreign key(target_recurring_rule_id,user_id) references public.recurring_rules(id,user_id) on delete restrict,
  constraint scenario_changes_allocation_owner_fkey foreign key(target_allocation_item_id,user_id) references public.allocation_plan_items(id,user_id) on delete restrict,
  constraint scenario_changes_goal_owner_fkey foreign key(target_goal_id,user_id) references public.goals(id,user_id) on delete restrict,
  constraint scenario_changes_source_owner_fkey foreign key(source_account_id,user_id) references public.accounts(id,user_id) on delete restrict,
  constraint scenario_changes_destination_owner_fkey foreign key(destination_account_id,user_id) references public.accounts(id,user_id) on delete restrict,
  constraint scenario_changes_category_owner_fkey foreign key(category_id,user_id) references public.categories(id,user_id) on delete restrict,
  constraint scenario_changes_fund_owner_fkey foreign key(fund_id,user_id) references public.funds(id,user_id) on delete restrict,
  constraint scenario_changes_dates check(effective_until is null or effective_on is null or effective_until >= effective_on),
  constraint scenario_changes_label check(label is null or char_length(btrim(label)) between 1 and 240),
  constraint scenario_changes_oneoff_shape check(
    change_type not in('add_one_off_income','add_one_off_expense','add_one_off_transfer') or
    (amount_minor > 0 and effective_on is not null and label is not null and
      (change_type<>'add_one_off_income' or (source_account_id is null and destination_account_id is not null)) and
      (change_type<>'add_one_off_expense' or (source_account_id is not null and destination_account_id is null)) and
      (change_type<>'add_one_off_transfer' or (source_account_id is not null and destination_account_id is not null and source_account_id<>destination_account_id)))
  ),
  constraint scenario_changes_target_shape check(
    (change_type not in('modify_forecast_item','suppress_forecast_item') or target_forecast_item_id is not null) and
    (change_type not in('modify_recurring_rule','pause_recurring_rule','modify_income_reliability') or target_recurring_rule_id is not null) and
    (change_type not in('modify_fund_contribution','pause_fund_contribution','modify_payday_item') or target_allocation_item_id is not null) and
    (change_type<>'modify_goal' or (target_goal_id is not null and target_field in('target','preferred','cap'))) and
    (change_type<>'modify_operating_floor' or amount_minor is not null) and
    (change_type<>'modify_safety_window' or amount_minor between 1 and 365)
  )
);

alter table public.forecast_items add column applied_scenario_change_id uuid;
alter table public.forecast_items add constraint forecast_items_applied_change_owner_fkey
  foreign key(applied_scenario_change_id,user_id) references public.scenario_changes(id,user_id) on delete restrict;
create unique index forecast_items_applied_change_uidx on public.forecast_items(applied_scenario_change_id) where applied_scenario_change_id is not null;
alter table public.recurring_rules add column applied_scenario_change_id uuid;
alter table public.recurring_rules add constraint recurring_rules_applied_change_owner_fkey
  foreign key(applied_scenario_change_id,user_id) references public.scenario_changes(id,user_id) on delete restrict;
create unique index recurring_rules_applied_change_uidx on public.recurring_rules(applied_scenario_change_id) where applied_scenario_change_id is not null;

create table public.scenario_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid not null,
  confirmation_token text not null,
  change_count integer not null check(change_count >= 0),
  summary jsonb not null,
  applied_at timestamptz not null default clock_timestamp(),
  constraint scenario_applications_id_user_unique unique(id,user_id),
  constraint scenario_applications_scenario_unique unique(scenario_id),
  constraint scenario_applications_scenario_owner_fkey foreign key(scenario_id,user_id) references public.scenarios(id,user_id) on delete restrict
);

create index scenario_changes_scenario_sort_idx on public.scenario_changes(scenario_id,sort_order,id);
create index scenario_changes_forecast_idx on public.scenario_changes(target_forecast_item_id) where target_forecast_item_id is not null;
create index scenario_changes_rule_idx on public.scenario_changes(target_recurring_rule_id) where target_recurring_rule_id is not null;
create index scenario_changes_allocation_idx on public.scenario_changes(target_allocation_item_id) where target_allocation_item_id is not null;
create index scenario_changes_goal_idx on public.scenario_changes(target_goal_id) where target_goal_id is not null;
create trigger scenario_changes_set_updated_at before update on public.scenario_changes for each row execute function runway_private.set_updated_at();

alter table public.scenario_changes enable row level security;
alter table public.scenario_applications enable row level security;
create policy scenario_changes_select_own on public.scenario_changes for select to authenticated using((select auth.uid())=user_id);
create policy scenario_changes_insert_own on public.scenario_changes for insert to authenticated with check((select auth.uid())=user_id);
create policy scenario_changes_update_own on public.scenario_changes for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy scenario_changes_delete_own on public.scenario_changes for delete to authenticated using((select auth.uid())=user_id);
create policy scenario_applications_select_own on public.scenario_applications for select to authenticated using((select auth.uid())=user_id);
revoke all on public.scenario_changes,public.scenario_applications from anon,authenticated;
grant select,insert,update,delete on public.scenario_changes to authenticated;
grant select on public.scenario_applications to authenticated;

create function runway_private.plan_confirmation_token(p_scenario_id uuid,p_updated_at timestamptz,p_change_count bigint,p_changes_fingerprint text)
returns text language sql immutable set search_path='' as $$
  select md5(p_scenario_id::text||':'||p_updated_at::text||':'||p_change_count::text||':'||coalesce(p_changes_fingerprint,''))
$$;

create function public.preview_plan_application(p_scenario_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_plan public.scenarios%rowtype; v_count bigint; v_token text; v_changes jsonb; v_fingerprint text;
begin
  if v_user is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select * into v_plan from public.scenarios where id=p_scenario_id and user_id=v_user;
  if not found then raise exception using errcode='P0002',message='Plan not found'; end if;
  select count(*),coalesce(jsonb_agg(jsonb_build_object('id',id,'type',change_type,'label',label,'effective_on',effective_on,
    'effective_until',effective_until,'amount_minor',amount_minor,'target_field',target_field) order by sort_order,id),'[]'::jsonb)
    ,coalesce(string_agg(id::text||':'||updated_at::text,',' order by id),'') into v_count,v_changes,v_fingerprint
    from public.scenario_changes where scenario_id=v_plan.id and user_id=v_user;
  v_token:=runway_private.plan_confirmation_token(v_plan.id,v_plan.updated_at,v_count,v_fingerprint);
  return jsonb_build_object('scenario_id',v_plan.id,'name',v_plan.name,'confirmation_token',v_token,'change_count',v_count,
    'changes',v_changes,'actual_transactions_created',0,'requires_confirmation',true);
end $$;

create function public.apply_plan_to_base(p_scenario_id uuid,p_confirmation_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_plan public.scenarios%rowtype; v_change public.scenario_changes%rowtype;
  v_count bigint; v_expected text; v_fingerprint text; v_application public.scenario_applications%rowtype; v_summary jsonb;
begin
  if v_user is null then raise exception using errcode='42501',message='Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':'||p_scenario_id::text||':apply-plan',0));
  select * into v_application from public.scenario_applications where scenario_id=p_scenario_id and user_id=v_user;
  if found then return v_application.summary||jsonb_build_object('application_id',v_application.id,'already_applied',true); end if;
  select * into v_plan from public.scenarios where id=p_scenario_id and user_id=v_user for update;
  if not found or v_plan.status in('archived','applied') then raise exception using errcode='P0002',message='Active or draft owned Plan required'; end if;
  select count(*),coalesce(string_agg(id::text||':'||updated_at::text,',' order by id),'') into v_count,v_fingerprint
  from public.scenario_changes where scenario_id=v_plan.id and user_id=v_user;
  v_expected:=runway_private.plan_confirmation_token(v_plan.id,v_plan.updated_at,v_count,v_fingerprint);
  if p_confirmation_token is null or p_confirmation_token<>v_expected then raise exception using errcode='22023',message='Apply preview is missing or stale'; end if;
  for v_change in select * from public.scenario_changes where scenario_id=v_plan.id and user_id=v_user order by sort_order,id for update loop
    if v_change.change_type in('add_one_off_income','add_one_off_expense','add_one_off_transfer') then
      insert into public.forecast_items(user_id,kind,expected_date,amount_minor,source_account_id,destination_account_id,category_id,label,confidence,status,applied_scenario_change_id)
      values(v_user,replace(v_change.change_type,'add_one_off_','')::public.runway_planned_kind,v_change.effective_on,v_change.amount_minor,
        v_change.source_account_id,v_change.destination_account_id,v_change.category_id,v_change.label,coalesce(v_change.confidence,'expected'),'expected',v_change.id)
      on conflict(applied_scenario_change_id) where applied_scenario_change_id is not null do nothing;
    elsif v_change.change_type='modify_forecast_item' then
      update public.forecast_items set amount_minor=coalesce(v_change.amount_minor,amount_minor),expected_date=coalesce(v_change.effective_on,expected_date),label=coalesce(v_change.label,label)
      where id=v_change.target_forecast_item_id and user_id=v_user;
      if not found then raise exception using errcode='P0002',message='Forecast item target is unavailable'; end if;
    elsif v_change.change_type='suppress_forecast_item' then
      update public.forecast_items set status='canceled' where id=v_change.target_forecast_item_id and user_id=v_user and status<>'matched';
      if not found then raise exception using errcode='P0002',message='Forecast item cannot be suppressed'; end if;
    elsif v_change.change_type='add_temporary_recurring_rule' then
      insert into public.recurring_rules(user_id,kind,label,source_account_id,destination_account_id,category_id,amount_minor,frequency,interval_count,
        day_of_month,day_of_week,start_on,end_on,confidence,active,applied_scenario_change_id)
      values(v_user,(v_change.payload_json->>'kind')::public.runway_planned_kind,v_change.label,v_change.source_account_id,v_change.destination_account_id,
        v_change.category_id,v_change.amount_minor,v_change.frequency,coalesce(v_change.interval_count,1),v_change.day_of_month,v_change.day_of_week,
        v_change.effective_on,v_change.effective_until,coalesce(v_change.confidence,'expected'),true,v_change.id)
      on conflict(applied_scenario_change_id) where applied_scenario_change_id is not null do nothing;
    elsif v_change.change_type='modify_recurring_rule' then
      if v_change.effective_on is not null or v_change.effective_until is not null then raise exception using errcode='0A000',message='Dated recurring changes require Base rule review'; end if;
      update public.recurring_rules set amount_minor=coalesce(v_change.amount_minor,amount_minor) where id=v_change.target_recurring_rule_id and user_id=v_user;
      if not found then raise exception using errcode='P0002',message='Recurring rule target is unavailable'; end if;
    elsif v_change.change_type='pause_recurring_rule' then
      if v_change.effective_on is not null or v_change.effective_until is not null then raise exception using errcode='0A000',message='Temporary pauses require Base rule review'; end if;
      update public.recurring_rules set active=false where id=v_change.target_recurring_rule_id and user_id=v_user;
      if not found then raise exception using errcode='P0002',message='Recurring rule target is unavailable'; end if;
    elsif v_change.change_type in('modify_fund_contribution','modify_payday_item') then
      update public.allocation_plan_items set amount_minor=v_change.amount_minor where id=v_change.target_allocation_item_id and user_id=v_user;
      if not found then raise exception using errcode='P0002',message='Payday item target is unavailable'; end if;
    elsif v_change.change_type='pause_fund_contribution' then
      update public.allocation_plan_items set active=false where id=v_change.target_allocation_item_id and user_id=v_user;
      if not found then raise exception using errcode='P0002',message='Payday item target is unavailable'; end if;
    elsif v_change.change_type='modify_goal' then
      update public.goals set target_minor=case when v_change.target_field='target' then v_change.amount_minor else target_minor end,
        preferred_balance_minor=case when v_change.target_field='preferred' then v_change.amount_minor else preferred_balance_minor end,
        cap_minor=case when v_change.target_field='cap' then v_change.amount_minor else cap_minor end
      where id=v_change.target_goal_id and user_id=v_user;
      if not found then raise exception using errcode='P0002',message='Goal target is unavailable'; end if;
    elsif v_change.change_type='modify_operating_floor' then update public.profiles set operating_floor_minor=v_change.amount_minor where user_id=v_user;
    elsif v_change.change_type='modify_safety_window' then update public.profiles set safety_window_days=v_change.amount_minor::integer where user_id=v_user;
    elsif v_change.change_type='modify_income_reliability' then
      update public.recurring_rules set is_reliable_income=coalesce(v_change.boolean_value,false) where id=v_change.target_recurring_rule_id and user_id=v_user and kind='income';
      if not found then raise exception using errcode='P0002',message='Recurring income target is unavailable'; end if;
    else raise exception using errcode='0A000',message='This assumption requires manual Base review';
    end if;
  end loop;
  update public.scenarios set status='applied',applied_at=clock_timestamp(),archived_at=clock_timestamp(),comparison_enabled=false where id=v_plan.id;
  v_summary:=jsonb_build_object('scenario_id',v_plan.id,'change_count',v_count,'actual_transactions_created',0,'already_applied',false);
  insert into public.scenario_applications(user_id,scenario_id,confirmation_token,change_count,summary)
  values(v_user,v_plan.id,v_expected,v_count,v_summary) returning * into v_application;
  return v_summary||jsonb_build_object('application_id',v_application.id);
end $$;

revoke all on function runway_private.plan_confirmation_token(uuid,timestamptz,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.preview_plan_application(uuid),public.apply_plan_to_base(uuid,text) from public,anon;
grant execute on function public.preview_plan_application(uuid),public.apply_plan_to_base(uuid,text) to authenticated;

update public.profiles p set schema_version=7
where exists(select 1 from runway_migration.application_records a where a.user_id=p.user_id);
