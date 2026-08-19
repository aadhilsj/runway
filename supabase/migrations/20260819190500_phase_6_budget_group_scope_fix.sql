-- Complete the intended Groceries + Misc category group without double-counting
-- a derived Miscellaneous category line in the initial October budget.

insert into public.budget_group_categories(user_id,group_id,category_id)
select g.user_id,g.id,c.id
from public.budget_groups g
join public.categories c on c.user_id=g.user_id and lower(c.name) in ('groceries','misc','miscellaneous')
where g.name='Groceries + Misc'
on conflict(group_id,category_id) do nothing;

delete from public.budget_lines l
using public.budget_periods p,public.categories c
where l.budget_period_id=p.id and l.user_id=p.user_id
  and l.category_id=c.id and l.user_id=c.user_id
  and p.month_start='2026-10-01'
  and lower(c.name) in ('misc','miscellaneous')
  and l.notes='Derived from base expected October planning items'
  and exists(
    select 1 from public.budget_groups g
    join public.budget_group_categories gc on gc.group_id=g.id and gc.user_id=g.user_id
    where g.user_id=l.user_id and g.name='Groceries + Misc' and gc.category_id=c.id
  );
