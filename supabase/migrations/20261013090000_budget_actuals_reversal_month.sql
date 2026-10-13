-- Attribute reversal entries to the month of the transaction they reverse.
--
-- public.budget_actuals buckets by date_trunc('month', t.occurred_at). A
-- reversal is posted when the correction is made, not when the original event
-- occurred, so reversing an August expense in October left August permanently
-- consuming its budget and created a phantom negative actual in October. The
-- ledger was already correct: the reversal is an exact equal-and-opposite
-- posted transaction. Only this read model mis-attributed it.
--
-- Corrections keep their real occurred_at so account balances, net-worth
-- history, and the audit trail still record when the correction happened.
-- Backdating the reversal itself would silently rewrite closing balances.
--
-- The reversal branch contributes the exact opposite of whatever the original
-- contributed, which keeps the defensive -abs() guard for genuine refunds
-- while letting a reversed refund net to zero instead of subtracting twice.
create or replace view public.budget_actuals with(security_invoker=true) as
select e.user_id,e.category_id,date_trunc('month',coalesce(o.occurred_at,t.occurred_at))::date as month_start,
  coalesce(sum(case
    when t.reverses_transaction_id is not null then
      case when t.kind='expense' then e.amount_minor
           when t.kind in ('refund','reimbursement') then abs(e.amount_minor) else 0 end
    when t.kind='expense' then e.amount_minor
    when t.kind in ('refund','reimbursement') then -abs(e.amount_minor)
    else 0 end),0)::bigint as actual_minor
from public.transaction_entries e join public.transactions t on t.id=e.transaction_id and t.user_id=e.user_id
left join public.transactions o on o.id=t.reverses_transaction_id and o.user_id=t.user_id
join public.accounts a on a.id=e.account_id and a.user_id=e.user_id
where t.status='posted' and e.category_id is not null and a.class='expense' and t.kind in ('expense','refund','reimbursement')
group by e.user_id,e.category_id,date_trunc('month',coalesce(o.occurred_at,t.occurred_at))::date;
