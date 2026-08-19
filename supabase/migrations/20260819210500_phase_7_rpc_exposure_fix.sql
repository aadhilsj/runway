-- Keep privileged Plan application code outside the exposed API schema.
-- Public functions remain stable security-invoker wrappers for PostgREST.

alter function public.preview_plan_application(uuid) rename to preview_plan_application_impl;
alter function public.preview_plan_application_impl(uuid) set schema runway_private;
alter function public.apply_plan_to_base(uuid,text) rename to apply_plan_to_base_impl;
alter function public.apply_plan_to_base_impl(uuid,text) set schema runway_private;

revoke all on function runway_private.preview_plan_application_impl(uuid),runway_private.apply_plan_to_base_impl(uuid,text)
  from public,anon,service_role;
grant execute on function runway_private.preview_plan_application_impl(uuid),runway_private.apply_plan_to_base_impl(uuid,text)
  to authenticated;

create function public.preview_plan_application(p_scenario_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select runway_private.preview_plan_application_impl(p_scenario_id)
$$;
create function public.apply_plan_to_base(p_scenario_id uuid,p_confirmation_token text)
returns jsonb language sql security invoker set search_path='' as $$
  select runway_private.apply_plan_to_base_impl(p_scenario_id,p_confirmation_token)
$$;
revoke all on function public.preview_plan_application(uuid),public.apply_plan_to_base(uuid,text) from public,anon;
grant execute on function public.preview_plan_application(uuid),public.apply_plan_to_base(uuid,text) to authenticated;
