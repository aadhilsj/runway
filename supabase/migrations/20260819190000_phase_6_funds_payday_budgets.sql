-- Runway 2 Phase 6: virtual funds, goals, payday plans, and normalized budgets.
-- This migration never reads or writes public.runway_state and creates no fund movements.

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backing_account_id uuid not null,
  name text not null,
  purpose_key text,
  currency text not null,
  color text,
  icon text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint funds_id_user_unique unique(id,user_id),
  constraint funds_backing_owner_fkey foreign key(backing_account_id,user_id) references public.accounts(id,user_id) on delete restrict,
  constraint funds_name_length check(char_length(btrim(name)) between 1 and 120),
  constraint funds_currency_format check(currency ~ '^[A-Z]{3}$'),
  constraint funds_sort_order_nonnegative check(sort_order >= 0)
);
create unique index funds_user_purpose_uidx on public.funds(user_id,purpose_key) where purpose_key is not null;
create index funds_user_active_idx on public.funds(user_id,sort_order) where active;
create index funds_backing_account_idx on public.funds(backing_account_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fund_id uuid not null,
  name text not null,
  target_minor bigint,
  preferred_balance_minor bigint,
  cap_minor bigint,
  preferred_contribution_minor bigint,
  floor_minor bigint,
  target_date date,
  status text not null default 'active' check(status in ('draft','active','paused','completed','archived')),
  is_primary boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint goals_id_user_unique unique(id,user_id),
  constraint goals_fund_owner_fkey foreign key(fund_id,user_id) references public.funds(id,user_id) on delete restrict,
  constraint goals_name_length check(char_length(btrim(name)) between 1 and 120),
  constraint goals_amounts_nonnegative check(
    (target_minor is null or target_minor >= 0) and (preferred_balance_minor is null or preferred_balance_minor >= 0)
    and (cap_minor is null or cap_minor >= 0) and (preferred_contribution_minor is null or preferred_contribution_minor >= 0)
    and (floor_minor is null or floor_minor >= 0)
  ),
  constraint goals_threshold_order check(
    (target_minor is null or preferred_balance_minor is null or target_minor <= preferred_balance_minor)
    and (preferred_balance_minor is null or cap_minor is null or preferred_balance_minor <= cap_minor)
    and (target_minor is null or cap_minor is null or target_minor <= cap_minor)
  )
);
create unique index goals_one_active_primary_uidx on public.goals(fund_id) where is_primary and status in ('draft','active','paused');
create index goals_user_status_idx on public.goals(user_id,status);

create table public.fund_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fund_id uuid not null,
  kind text not null check(kind in ('allocation','release','transfer_in','transfer_out','spend','adjustment')),
  amount_minor bigint not null,
  occurred_at timestamptz not null default clock_timestamp(),
  description text not null,
  related_fund_id uuid,
  transaction_id uuid,
  payday_execution_item_id uuid,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint fund_movements_id_user_unique unique(id,user_id),
  constraint fund_movements_fund_owner_fkey foreign key(fund_id,user_id) references public.funds(id,user_id) on delete restrict,
  constraint fund_movements_related_owner_fkey foreign key(related_fund_id,user_id) references public.funds(id,user_id) on delete restrict,
  constraint fund_movements_transaction_owner_fkey foreign key(transaction_id,user_id) references public.transactions(id,user_id) on delete restrict,
  constraint fund_movements_amount_nonzero check(amount_minor <> 0),
  constraint fund_movements_sign check(
    (kind in ('allocation','transfer_in') and amount_minor > 0)
    or (kind in ('release','transfer_out','spend') and amount_minor < 0)
    or kind = 'adjustment'
  ),
  constraint fund_movements_description_length check(char_length(btrim(description)) between 1 and 240),
  constraint fund_movements_idempotency_length check(idempotency_key is null or char_length(idempotency_key) between 1 and 128),
  constraint fund_movements_transfer_shape check((kind in ('transfer_in','transfer_out')) = (related_fund_id is not null)),
  constraint fund_movements_spend_shape check((kind = 'spend') = (transaction_id is not null))
);
create unique index fund_movements_user_idempotency_uidx on public.fund_movements(user_id,idempotency_key) where idempotency_key is not null;
create index fund_movements_fund_occurred_idx on public.fund_movements(fund_id,occurred_at desc);
create index fund_movements_transaction_idx on public.fund_movements(transaction_id) where transaction_id is not null;

create table public.allocation_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger_kind text not null default 'payday' check(trigger_kind in ('manual','payday','income_transaction')),
  source_account_id uuid not null,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint allocation_plans_id_user_unique unique(id,user_id),
  constraint allocation_plans_source_owner_fkey foreign key(source_account_id,user_id) references public.accounts(id,user_id) on delete restrict,
  constraint allocation_plans_name_length check(char_length(btrim(name)) between 1 and 120)
);
create unique index allocation_plans_one_default_uidx on public.allocation_plans(user_id) where is_default and active;

create table public.allocation_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  label text not null,
  destination_type text not null check(destination_type in ('fund','account')),
  destination_fund_id uuid,
  destination_account_id uuid,
  amount_minor bigint not null check(amount_minor > 0),
  mode text not null default 'recommended' check(mode in ('manual','recommended','automatic')),
  priority integer not null check(priority > 0),
  stop_basis text not null default 'none' check(stop_basis in ('none','target','preferred','cap')),
  activation_source_item_id uuid,
  active boolean not null default true,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint allocation_items_id_user_unique unique(id,user_id),
  constraint allocation_items_plan_owner_fkey foreign key(plan_id,user_id) references public.allocation_plans(id,user_id) on delete cascade,
  constraint allocation_items_fund_owner_fkey foreign key(destination_fund_id,user_id) references public.funds(id,user_id) on delete restrict,
  constraint allocation_items_account_owner_fkey foreign key(destination_account_id,user_id) references public.accounts(id,user_id) on delete restrict,
  constraint allocation_items_activation_owner_fkey foreign key(activation_source_item_id,user_id) references public.allocation_plan_items(id,user_id) on delete restrict,
  constraint allocation_items_destination_shape check(
    (destination_type='fund' and destination_fund_id is not null and destination_account_id is null)
    or (destination_type='account' and destination_account_id is not null and destination_fund_id is null)
  ),
  constraint allocation_items_date_order check(ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint allocation_items_label_length check(char_length(btrim(label)) between 1 and 120)
);
create unique index allocation_items_plan_priority_uidx on public.allocation_plan_items(plan_id,priority);
create index allocation_items_destination_fund_idx on public.allocation_plan_items(destination_fund_id) where destination_fund_id is not null;

create table public.payday_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  trigger_transaction_id uuid,
  idempotency_key text not null,
  status text not null check(status in ('confirmed','partially_executed','executed','failed')),
  recommended_total_minor bigint not null check(recommended_total_minor >= 0),
  executed_total_minor bigint not null check(executed_total_minor >= 0),
  snapshot jsonb not null,
  executed_at timestamptz not null default clock_timestamp(),
  constraint payday_executions_id_user_unique unique(id,user_id),
  constraint payday_executions_plan_owner_fkey foreign key(plan_id,user_id) references public.allocation_plans(id,user_id) on delete restrict,
  constraint payday_executions_trigger_owner_fkey foreign key(trigger_transaction_id,user_id) references public.transactions(id,user_id) on delete restrict,
  constraint payday_executions_user_idempotency_unique unique(user_id,idempotency_key)
);
create unique index payday_one_trigger_uidx on public.payday_executions(user_id,plan_id,trigger_transaction_id) where trigger_transaction_id is not null;

create table public.payday_execution_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  execution_id uuid not null,
  plan_item_id uuid not null,
  recommended_minor bigint not null check(recommended_minor >= 0),
  approved_minor bigint not null check(approved_minor >= 0),
  executed_minor bigint not null check(executed_minor >= 0),
  status text not null check(status in ('executed','skipped','account_transfer_required')),
  explanation text,
  created_at timestamptz not null default clock_timestamp(),
  constraint payday_execution_items_id_user_unique unique(id,user_id),
  constraint payday_items_execution_owner_fkey foreign key(execution_id,user_id) references public.payday_executions(id,user_id) on delete cascade,
  constraint payday_items_plan_item_owner_fkey foreign key(plan_item_id,user_id) references public.allocation_plan_items(id,user_id) on delete restrict,
  constraint payday_items_execution_item_unique unique(execution_id,plan_item_id)
);
alter table public.fund_movements add constraint fund_movements_payday_item_owner_fkey foreign key(payday_execution_item_id,user_id) references public.payday_execution_items(id,user_id) on delete restrict;

create table public.budget_periods (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null, currency text not null, status text not null default 'planned' check(status in ('planned','active','closed')),
  notes text, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  constraint budget_periods_id_user_unique unique(id,user_id), constraint budget_periods_user_month_unique unique(user_id,month_start),
  constraint budget_periods_month_start check(extract(day from month_start)=1), constraint budget_periods_currency_format check(currency ~ '^[A-Z]{3}$')
);
create table public.budget_groups (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, active boolean not null default true, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  constraint budget_groups_id_user_unique unique(id,user_id), constraint budget_groups_user_name_unique unique(user_id,name),
  constraint budget_groups_name_length check(char_length(btrim(name)) between 1 and 120)
);
create table public.budget_group_categories (
  user_id uuid not null references auth.users(id) on delete cascade, group_id uuid not null, category_id uuid not null,
  created_at timestamptz not null default clock_timestamp(), primary key(group_id,category_id),
  constraint budget_group_categories_group_owner_fkey foreign key(group_id,user_id) references public.budget_groups(id,user_id) on delete cascade,
  constraint budget_group_categories_category_owner_fkey foreign key(category_id,user_id) references public.categories(id,user_id) on delete restrict
);
create table public.budget_lines (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  budget_period_id uuid not null, category_id uuid, group_id uuid, budgeted_minor bigint not null check(budgeted_minor >= 0),
  rollover boolean not null default false, notes text, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  constraint budget_lines_id_user_unique unique(id,user_id),
  constraint budget_lines_period_owner_fkey foreign key(budget_period_id,user_id) references public.budget_periods(id,user_id) on delete cascade,
  constraint budget_lines_category_owner_fkey foreign key(category_id,user_id) references public.categories(id,user_id) on delete restrict,
  constraint budget_lines_group_owner_fkey foreign key(group_id,user_id) references public.budget_groups(id,user_id) on delete restrict,
  constraint budget_lines_target_shape check((category_id is not null)::int + (group_id is not null)::int = 1)
);
create unique index budget_lines_period_category_uidx on public.budget_lines(budget_period_id,category_id) where category_id is not null;
create unique index budget_lines_period_group_uidx on public.budget_lines(budget_period_id,group_id) where group_id is not null;

create trigger funds_set_updated_at before update on public.funds for each row execute function runway_private.set_updated_at();
create trigger goals_set_updated_at before update on public.goals for each row execute function runway_private.set_updated_at();
create trigger allocation_plans_set_updated_at before update on public.allocation_plans for each row execute function runway_private.set_updated_at();
create trigger allocation_items_set_updated_at before update on public.allocation_plan_items for each row execute function runway_private.set_updated_at();
create trigger budget_periods_set_updated_at before update on public.budget_periods for each row execute function runway_private.set_updated_at();
create trigger budget_groups_set_updated_at before update on public.budget_groups for each row execute function runway_private.set_updated_at();
create trigger budget_lines_set_updated_at before update on public.budget_lines for each row execute function runway_private.set_updated_at();

create view public.fund_balances with(security_invoker=true) as
select f.user_id,f.id as fund_id,f.backing_account_id,f.currency,coalesce(sum(m.amount_minor),0)::bigint as balance_minor
from public.funds f left join public.fund_movements m on m.fund_id=f.id and m.user_id=f.user_id group by f.user_id,f.id,f.backing_account_id,f.currency;
create view public.fund_backing_summary with(security_invoker=true) as
select a.user_id,a.id as account_id,a.name as account_name,b.display_balance_minor as account_balance_minor,
  coalesce(sum(fb.balance_minor),0)::bigint as allocated_minor,(b.display_balance_minor-coalesce(sum(fb.balance_minor),0))::bigint as unallocated_minor,
  (coalesce(sum(fb.balance_minor),0)>=0 and b.display_balance_minor-coalesce(sum(fb.balance_minor),0)>=0) as backing_valid
from public.accounts a join public.account_balances b on b.account_id=a.id and b.user_id=a.user_id
left join public.fund_balances fb on fb.backing_account_id=a.id and fb.user_id=a.user_id
where not a.is_system group by a.user_id,a.id,a.name,b.display_balance_minor;

create view public.budget_actuals with(security_invoker=true) as
select e.user_id,e.category_id,date_trunc('month',t.occurred_at)::date as month_start,
  coalesce(sum(case when t.kind='expense' then e.amount_minor when t.kind in ('refund','reimbursement') then -abs(e.amount_minor) else 0 end),0)::bigint as actual_minor
from public.transaction_entries e join public.transactions t on t.id=e.transaction_id and t.user_id=e.user_id
join public.accounts a on a.id=e.account_id and a.user_id=e.user_id
where t.status='posted' and e.category_id is not null and a.class='expense' and t.kind in ('expense','refund','reimbursement')
group by e.user_id,e.category_id,date_trunc('month',t.occurred_at)::date;
create view public.budget_commitments with(security_invoker=true) as
select user_id,category_id,date_trunc('month',expected_date::timestamp)::date as month_start,sum(amount_minor)::bigint as committed_minor
from public.forecast_items where status='expected' and kind='expense' and category_id is not null
group by user_id,category_id,date_trunc('month',expected_date::timestamp)::date;

create function runway_private.fund_balance_impl(p_fund_id uuid,p_user_id uuid) returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(amount_minor),0)::bigint from public.fund_movements where fund_id=p_fund_id and user_id=p_user_id
$$;
create function runway_private.allocate_to_fund_impl(p_fund_id uuid,p_amount_minor bigint,p_occurred_at timestamptz,p_description text,p_idempotency_key text,p_payday_item_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_fund public.funds%rowtype; v_available bigint; v_floor bigint:=0; v_id uuid;
begin
 if v_user is null then raise exception using errcode='42501',message='Authentication required'; end if;
 if p_amount_minor is null or p_amount_minor<=0 then raise exception using errcode='22023',message='Allocation amount must be positive'; end if;
 if p_idempotency_key is not null then select id into v_id from public.fund_movements where user_id=v_user and idempotency_key=p_idempotency_key; if found then return v_id; end if; end if;
 select * into v_fund from public.funds where id=p_fund_id and user_id=v_user and active for update;
 if not found then raise exception using errcode='42501',message='Active owned fund required'; end if;
 select b.display_balance_minor-coalesce(sum(fb.balance_minor),0) into v_available from public.account_balances b
 left join public.fund_balances fb on fb.backing_account_id=b.account_id and fb.user_id=b.user_id
 where b.account_id=v_fund.backing_account_id and b.user_id=v_user group by b.display_balance_minor;
 select case when a.liquidity_class='operating' then coalesce(p.operating_floor_minor,0) else 0 end into v_floor
 from public.accounts a join public.profiles p on p.user_id=a.user_id where a.id=v_fund.backing_account_id and a.user_id=v_user;
 if coalesce(v_available,0)-v_floor<p_amount_minor then raise exception using errcode='23514',message='Allocation exceeds cash available above the operating floor'; end if;
 insert into public.fund_movements(user_id,fund_id,kind,amount_minor,occurred_at,description,idempotency_key,payday_execution_item_id)
 values(v_user,p_fund_id,'allocation',p_amount_minor,coalesce(p_occurred_at,clock_timestamp()),btrim(p_description),p_idempotency_key,p_payday_item_id) returning id into v_id;
 return v_id;
end $$;
create function public.allocate_to_fund(p_fund_id uuid,p_amount_minor bigint,p_occurred_at timestamptz,p_description text,p_idempotency_key text)
returns uuid language sql security invoker set search_path='' as $$select runway_private.allocate_to_fund_impl($1,$2,$3,$4,$5,null)$$;

create function public.release_from_fund(p_fund_id uuid,p_amount_minor bigint,p_occurred_at timestamptz,p_description text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_id uuid;
begin
 if v_user is null then raise exception using errcode='42501',message='Authentication required'; end if;
 if p_amount_minor is null or p_amount_minor<=0 then raise exception using errcode='22023',message='Release amount must be positive'; end if;
 if p_idempotency_key is not null then select id into v_id from public.fund_movements where user_id=v_user and idempotency_key=p_idempotency_key; if found then return v_id; end if; end if;
 perform 1 from public.funds where id=p_fund_id and user_id=v_user for update;
 if not found then raise exception using errcode='42501',message='Owned fund required'; end if;
 if runway_private.fund_balance_impl(p_fund_id,v_user)<p_amount_minor then raise exception using errcode='23514',message='Release exceeds fund balance'; end if;
 insert into public.fund_movements(user_id,fund_id,kind,amount_minor,occurred_at,description,idempotency_key)
 values(v_user,p_fund_id,'release',-p_amount_minor,coalesce(p_occurred_at,clock_timestamp()),btrim(p_description),p_idempotency_key) returning id into v_id; return v_id;
end $$;

create function public.transfer_between_funds(p_source_fund_id uuid,p_destination_fund_id uuid,p_amount_minor bigint,p_occurred_at timestamptz,p_description text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_out uuid; v_in uuid;
begin
 if v_user is null then raise exception using errcode='42501',message='Authentication required'; end if;
 if p_source_fund_id=p_destination_fund_id or p_amount_minor is null or p_amount_minor<=0 then raise exception using errcode='22023',message='Distinct funds and a positive amount are required'; end if;
 perform 1 from public.funds where id in(p_source_fund_id,p_destination_fund_id) and user_id=v_user order by id for update;
 if (select count(*) from public.funds where id in(p_source_fund_id,p_destination_fund_id) and user_id=v_user)<>2 then raise exception using errcode='42501',message='Owned funds required'; end if;
 if runway_private.fund_balance_impl(p_source_fund_id,v_user)<p_amount_minor then raise exception using errcode='23514',message='Transfer exceeds source fund balance'; end if;
 if p_idempotency_key is not null then select id into v_out from public.fund_movements where user_id=v_user and idempotency_key=p_idempotency_key||':out'; select id into v_in from public.fund_movements where user_id=v_user and idempotency_key=p_idempotency_key||':in'; if v_out is not null and v_in is not null then return jsonb_build_object('out',v_out,'in',v_in); end if; end if;
 insert into public.fund_movements(user_id,fund_id,kind,amount_minor,occurred_at,description,related_fund_id,idempotency_key) values(v_user,p_source_fund_id,'transfer_out',-p_amount_minor,coalesce(p_occurred_at,clock_timestamp()),btrim(p_description),p_destination_fund_id,case when p_idempotency_key is null then null else p_idempotency_key||':out' end) returning id into v_out;
 insert into public.fund_movements(user_id,fund_id,kind,amount_minor,occurred_at,description,related_fund_id,idempotency_key) values(v_user,p_destination_fund_id,'transfer_in',p_amount_minor,coalesce(p_occurred_at,clock_timestamp()),btrim(p_description),p_source_fund_id,case when p_idempotency_key is null then null else p_idempotency_key||':in' end) returning id into v_in;
 return jsonb_build_object('out',v_out,'in',v_in);
end $$;

create function public.post_fund_spend(p_fund_id uuid,p_source_account_id uuid,p_amount_minor bigint,p_category_id uuid,p_occurred_at timestamptz,p_description text,p_merchant_or_source text,p_notes text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_tx uuid; v_movement uuid;
begin
 if v_user is null then raise exception using errcode='42501',message='Authentication required'; end if;
 perform 1 from public.funds where id=p_fund_id and user_id=v_user for update;
 if not found then raise exception using errcode='42501',message='Owned fund required'; end if;
 if runway_private.fund_balance_impl(p_fund_id,v_user)<p_amount_minor then raise exception using errcode='23514',message='Spend exceeds fund balance'; end if;
 v_tx:=runway_private.post_expense_impl(p_source_account_id,p_amount_minor,p_category_id,p_occurred_at,p_description,p_merchant_or_source,p_notes,case when p_idempotency_key is null then null else p_idempotency_key||':transaction' end);
 select id into v_movement from public.fund_movements where transaction_id=v_tx and fund_id=p_fund_id;
 if v_movement is null then insert into public.fund_movements(user_id,fund_id,kind,amount_minor,occurred_at,description,transaction_id,idempotency_key)
 values(v_user,p_fund_id,'spend',-p_amount_minor,p_occurred_at,btrim(p_description),v_tx,case when p_idempotency_key is null then null else p_idempotency_key||':fund' end) returning id into v_movement; end if;
 return jsonb_build_object('transaction_id',v_tx,'fund_movement_id',v_movement);
end $$;

create function public.execute_payday_allocation(p_plan_id uuid,p_trigger_transaction_id uuid,p_items jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_execution uuid; v_row jsonb; v_item public.allocation_plan_items%rowtype; v_execution_item uuid; v_approved bigint; v_rec bigint; v_exec bigint:=0; v_total bigint:=0;
begin
 if v_user is null then raise exception using errcode='42501',message='Authentication required'; end if;
 select id into v_execution from public.payday_executions where user_id=v_user and idempotency_key=p_idempotency_key; if found then return v_execution; end if;
 perform 1 from public.allocation_plans where id=p_plan_id and user_id=v_user and active for update; if not found then raise exception using errcode='42501',message='Active owned plan required'; end if;
 if jsonb_typeof(p_items)<>'array' then raise exception using errcode='22023',message='Approved items must be an array'; end if;
 select coalesce(sum((x->>'recommended_minor')::bigint),0),coalesce(sum((x->>'approved_minor')::bigint),0) into v_rec,v_total from jsonb_array_elements(p_items) x;
 if exists(select 1 from jsonb_array_elements(p_items) x where (x->>'approved_minor')::bigint<0 or (x->>'approved_minor')::bigint>(x->>'recommended_minor')::bigint)
 then raise exception using errcode='22023',message='Approved amount must be between zero and the recommendation'; end if;
 insert into public.payday_executions(user_id,plan_id,trigger_transaction_id,idempotency_key,status,recommended_total_minor,executed_total_minor,snapshot)
 values(v_user,p_plan_id,p_trigger_transaction_id,p_idempotency_key,'confirmed',v_rec,0,p_items) returning id into v_execution;
 for v_row in select * from jsonb_array_elements(p_items) loop
  select * into v_item from public.allocation_plan_items where id=(v_row->>'plan_item_id')::uuid and plan_id=p_plan_id and user_id=v_user and active;
  if not found then raise exception using errcode='42501',message='Approved plan item unavailable'; end if;
  v_approved:=(v_row->>'approved_minor')::bigint; if v_approved<0 then raise exception using errcode='22023',message='Approved amount cannot be negative'; end if;
  insert into public.payday_execution_items(user_id,execution_id,plan_item_id,recommended_minor,approved_minor,executed_minor,status,explanation)
  values(v_user,v_execution,v_item.id,(v_row->>'recommended_minor')::bigint,v_approved,0,case when v_approved=0 then 'skipped' when v_item.destination_type='account' then 'account_transfer_required' else 'skipped' end,
    case when v_item.destination_type='account' then 'A real account transfer must be posted separately.' else null end) returning id into v_execution_item;
  if v_approved>0 and v_item.destination_type='fund' then
   perform runway_private.allocate_to_fund_impl(v_item.destination_fund_id,v_approved,clock_timestamp(),'Payday allocation: '||v_item.label,p_idempotency_key||':'||v_item.id,v_execution_item);
   update public.payday_execution_items set executed_minor=v_approved,status='executed' where id=v_execution_item; v_exec:=v_exec+v_approved;
  end if;
 end loop;
 update public.payday_executions set executed_total_minor=v_exec,status=case when v_exec=v_total then 'executed' else 'partially_executed' end where id=v_execution;
 return v_execution;
end $$;

do $$ declare r record; begin
 for r in select unnest(array['funds','goals','fund_movements','allocation_plans','allocation_plan_items','payday_executions','payday_execution_items','budget_periods','budget_groups','budget_group_categories','budget_lines']) name loop
  execute format('alter table public.%I enable row level security',r.name);
  execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid())=user_id)',r.name||'_select_own',r.name);
 end loop;
end $$;
create policy funds_write_own on public.funds for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy goals_write_own on public.goals for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy allocation_plans_write_own on public.allocation_plans for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy allocation_items_write_own on public.allocation_plan_items for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy budget_periods_write_own on public.budget_periods for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy budget_groups_write_own on public.budget_groups for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy budget_group_categories_write_own on public.budget_group_categories for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy budget_lines_write_own on public.budget_lines for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

revoke all on public.funds,public.goals,public.fund_movements,public.allocation_plans,public.allocation_plan_items,public.payday_executions,public.payday_execution_items,public.budget_periods,public.budget_groups,public.budget_group_categories,public.budget_lines from anon,authenticated;
grant select,insert,update,delete on public.funds,public.goals,public.allocation_plans,public.allocation_plan_items,public.budget_periods,public.budget_groups,public.budget_group_categories,public.budget_lines to authenticated;
grant select on public.fund_movements,public.payday_executions,public.payday_execution_items,public.fund_balances,public.fund_backing_summary,public.budget_actuals,public.budget_commitments to authenticated;
revoke all on function public.allocate_to_fund(uuid,bigint,timestamptz,text,text),public.release_from_fund(uuid,bigint,timestamptz,text,text),public.transfer_between_funds(uuid,uuid,bigint,timestamptz,text,text),public.post_fund_spend(uuid,uuid,bigint,uuid,timestamptz,text,text,text,text),public.execute_payday_allocation(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.allocate_to_fund(uuid,bigint,timestamptz,text,text),public.release_from_fund(uuid,bigint,timestamptz,text,text),public.transfer_between_funds(uuid,uuid,bigint,timestamptz,text,text),public.post_fund_spend(uuid,uuid,bigint,uuid,timestamptz,text,text,text,text),public.execute_payday_allocation(uuid,uuid,jsonb,text) to authenticated;

-- Initialize configuration for the one Phase 4-applied owner. No balances or executions are created.
do $$
declare v_user uuid; v_operating uuid; v_investments uuid; v_plan uuid; v_period uuid; v_group uuid; v_item_emergency uuid; v_item_travel uuid; v_fund record;
begin
 select user_id,operating_account_id into v_user,v_operating from runway_migration.application_records order by applied_at desc limit 1;
 if v_user is null then return; end if;
 insert into public.accounts(user_id,name,class,subtype,currency,is_system,include_in_net_worth,liquidity_class,valuation_mode,creation_idempotency_key,creation_payload)
 values(v_user,'Investments','asset','investment','NOK',false,true,'invested','manual_market_value','phase6-investments-account','{"phase":6,"opening_balance_minor":0}'::jsonb)
 on conflict(user_id,creation_idempotency_key) where creation_idempotency_key is not null do nothing;
 select id into v_investments from public.accounts where user_id=v_user and creation_idempotency_key='phase6-investments-account';
 insert into public.funds(user_id,backing_account_id,name,purpose_key,currency,sort_order) values
 (v_user,v_operating,'Emergency','emergency','NOK',1),(v_user,v_operating,'Travel','travel','NOK',2),(v_user,v_operating,'Home','home','NOK',3),
 (v_user,v_operating,'Family','family','NOK',4),(v_user,v_operating,'Fero','fero','NOK',5) on conflict(user_id,purpose_key) where purpose_key is not null do nothing;
 for v_fund in select * from public.funds where user_id=v_user loop
  insert into public.goals(user_id,fund_id,name,target_minor,preferred_balance_minor,cap_minor,preferred_contribution_minor,status,is_primary)
  values(v_user,v_fund.id,v_fund.name||' goal',case when v_fund.purpose_key='emergency' then 4500000 else null end,
    case when v_fund.purpose_key='travel' then 3000000 else null end,
    case when v_fund.purpose_key='travel' then 4000000 when v_fund.purpose_key='fero' then 1000000 else null end,
    case v_fund.purpose_key when 'emergency' then 500000 when 'travel' then 400000 when 'home' then 300000 when 'family' then 100000 when 'fero' then 50000 end,
    'active',true) on conflict(fund_id) where is_primary and status in ('draft','active','paused') do nothing;
 end loop;
 insert into public.allocation_plans(user_id,name,trigger_kind,source_account_id,active,is_default) values(v_user,'Payday plan','payday',v_operating,true,true) returning id into v_plan;
 insert into public.allocation_plan_items(user_id,plan_id,label,destination_type,destination_fund_id,amount_minor,mode,priority,stop_basis)
 select v_user,v_plan,x.label,'fund',f.id,x.amount,'recommended',x.priority,x.stop from (values
  ('Emergency',500000,1,'target'),('Home',300000,2,'none'),('Travel',400000,4,'cap'),('Family',100000,5,'none'),('Fero',50000,6,'cap')) x(label,amount,priority,stop)
 join public.funds f on f.user_id=v_user and f.purpose_key=lower(x.label);
 insert into public.allocation_plan_items(user_id,plan_id,label,destination_type,destination_account_id,amount_minor,mode,priority,stop_basis)
 values(v_user,v_plan,'Investments','account',v_investments,300000,'recommended',3,'none');
 select id into v_item_emergency from public.allocation_plan_items where plan_id=v_plan and label='Emergency';
 select id into v_item_travel from public.allocation_plan_items where plan_id=v_plan and label='Travel';
 insert into public.allocation_plan_items(user_id,plan_id,label,destination_type,destination_fund_id,amount_minor,mode,priority,stop_basis,activation_source_item_id)
 select v_user,v_plan,x.label,'fund',f.id,x.amount,'recommended',x.priority,'none',x.source_id from (values
  ('Emergency complete → Home',300000,7,v_item_emergency,'home'),('Emergency complete → Investments placeholder',200000,8,v_item_emergency,null::text),('Travel capped → Home',400000,9,v_item_travel,'home')) x(label,amount,priority,source_id,purpose)
 join public.funds f on f.user_id=v_user and f.purpose_key=x.purpose where x.purpose is not null;
 insert into public.allocation_plan_items(user_id,plan_id,label,destination_type,destination_account_id,amount_minor,mode,priority,stop_basis,activation_source_item_id)
 values(v_user,v_plan,'Emergency complete → Investments','account',v_investments,200000,'recommended',8,'none',v_item_emergency);
 insert into public.budget_periods(user_id,month_start,currency,status,notes) values(v_user,'2026-10-01','NOK','planned','Initial editable normal-living budget') returning id into v_period;
 insert into public.budget_groups(user_id,name) values(v_user,'Groceries + Misc') returning id into v_group;
 insert into public.budget_group_categories(user_id,group_id,category_id) select v_user,v_group,id from public.categories where user_id=v_user and lower(name) in('groceries','misc');
 insert into public.budget_lines(user_id,budget_period_id,group_id,budgeted_minor,notes) values(v_user,v_period,v_group,500000,'Combined cap preserved because the legacy plan did not justify an arbitrary split.');
 insert into public.budget_lines(user_id,budget_period_id,category_id,budgeted_minor,notes)
 select v_user,v_period,category_id,sum(amount_minor),'Derived from base expected October planning items'
 from public.forecast_items where user_id=v_user and kind='expense' and status='expected' and scenario_id is null and expected_date between '2026-10-01' and '2026-10-31'
 and category_id is not null and category_id not in(select category_id from public.budget_group_categories where group_id=v_group)
 group by category_id on conflict(budget_period_id,category_id) where category_id is not null do nothing;
 update public.profiles set safety_window_days=coalesce(safety_window_days,30),schema_version=6 where user_id=v_user;
end $$;
