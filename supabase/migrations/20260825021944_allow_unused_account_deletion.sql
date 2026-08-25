-- Accounts may only be hard-deleted by their owner. Existing foreign-key
-- relationships use ON DELETE RESTRICT, so financial history remains protected.
create policy accounts_delete_own_non_system
on public.accounts
for delete
to authenticated
using ((select auth.uid()) = user_id and not is_system);

grant delete on public.accounts to authenticated;
