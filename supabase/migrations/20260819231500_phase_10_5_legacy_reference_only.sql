-- Phase 10.5: legacy Runway remains readable for reference and rollback inspection,
-- but authenticated browser sessions can no longer mutate its JSON state.
-- Service-role backup and recovery access is intentionally unaffected.

drop policy if exists "runway_state_insert_own" on public.runway_state;
drop policy if exists "runway_state_update_own" on public.runway_state;

revoke all privileges on public.runway_state from authenticated;
grant select on public.runway_state to authenticated;
