-- Aggregate views must be read-only and authenticated-only (remote migration version 20260819060415).
revoke all on public.account_balances, public.current_net_worth from public, anon, authenticated;
grant select on public.account_balances, public.current_net_worth to authenticated;
