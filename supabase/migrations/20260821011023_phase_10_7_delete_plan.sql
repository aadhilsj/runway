-- Allow an authenticated owner to permanently remove a draft/active Plan and
-- every forecast-only record that belongs to it. Applied Plans remain an audit
-- record and cannot be deleted.

create or replace function public.delete_plan(p_scenario_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_plan public.scenarios%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_plan
  from public.scenarios
  where id = p_scenario_id and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Plan not found';
  end if;

  if v_plan.status = 'applied' then
    raise exception using errcode = '55000', message = 'Applied Plans cannot be deleted';
  end if;

  delete from public.forecast_items
  where scenario_id = v_plan.id and user_id = v_user_id;

  delete from public.recurring_rules
  where scenario_id = v_plan.id and user_id = v_user_id;

  delete from public.scenario_changes
  where scenario_id = v_plan.id and user_id = v_user_id;

  delete from public.scenarios
  where id = v_plan.id and user_id = v_user_id;
end;
$$;

revoke all on function public.delete_plan(uuid) from public, anon;
grant execute on function public.delete_plan(uuid) to authenticated;
