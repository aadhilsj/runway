import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { budgetsRepository } from "~/data/repositories/budgets-repository";
import { calculateBudgetLine } from "~/domain/budgets";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";

function money(value: number, currency: string) { return formatMinorUnits(asMinorUnits(value), currency); }

export default function BudgetsRoute() {
  const qc = useQueryClient();
  const workspace = useQuery({ queryKey: ["budget-workspace"], queryFn: () => budgetsRepository.getWorkspace() });
  const [selected, setSelected] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const period = workspace.data?.periods.find((row) => row.id === (selected || workspace.data?.periods.at(-1)?.id));
  const rows = useMemo(() => {
    if (!workspace.data || !period) return [];
    return workspace.data.lines.filter((line) => line.budget_period_id === period.id).map((line) => {
      const categoryIds = line.category_id ? [line.category_id] : workspace.data!.groupCategories.filter((row) => row.group_id === line.group_id).map((row) => row.category_id);
      const actual = workspace.data!.actuals.filter((row) => row.month_start === period.month_start && categoryIds.includes(row.category_id)).reduce((sum, row) => sum + Number(row.actual_minor), 0);
      const committed = workspace.data!.commitments.filter((row) => row.month_start === period.month_start && categoryIds.includes(row.category_id)).reduce((sum, row) => sum + Number(row.committed_minor), 0);
      const label = line.category_id ? workspace.data!.categories.find((row) => row.id === line.category_id)?.name : workspace.data!.groups.find((row) => row.id === line.group_id)?.name;
      return { line, label: label ?? "Budget line", ...calculateBudgetLine({ budgetedMinor: Number(line.budgeted_minor), expenseMinor: actual, committedForecastMinor: committed }) };
    });
  }, [workspace.data, period]);
  const add = useMutation({
    mutationFn: async () => {
      if (!period || !category) throw new Error("Choose a period and category.");
      const minor = Number(parseDisplayAmountToMinor(amount));
      if (minor < 0) throw new Error("Budget cannot be negative.");
      await budgetsRepository.createLine(period.id, category, minor);
    },
    onSuccess: () => { setAmount(""); setCategory(""); setError(""); setDrawerOpen(false); void qc.invalidateQueries({ queryKey: ["budget-workspace"] }); },
    onError: (value) => setError(value instanceof Error ? value.message : "Could not save budget"),
  });
  function submit(event: FormEvent) { event.preventDefault(); add.mutate(); }
  const currency = workspace.data?.currency ?? "NOK";

  return <Page eyebrow="Intentional limits" title="Budgets" description="Monthly limits compared with posted spending and committed plans. Transfers and fund allocations stay separate.">
    {workspace.isLoading ? <p className="muted">Loading budgets…</p> : null}
    {workspace.data ? <>
      <div className="forecast-toolbar compact-toolbar"><label className="standalone-label">Budget month<select value={period?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>{workspace.data.periods.map((row) => <option key={row.id} value={row.id}>{row.month_start.slice(0, 7)} · {row.status}</option>)}</select></label><span className="muted">Actuals use posted expenses and refunds only.</span><button className="primary-button" type="button" onClick={() => setDrawerOpen(true)}>Add budget line</button></div>
      <section className="money-summary"><div className="metric-card"><p>Budgeted</p><strong>{money(rows.reduce((sum, row) => sum + row.budgetedMinor, 0), currency)}</strong></div><div className="metric-card"><p>Actual</p><strong>{money(rows.reduce((sum, row) => sum + row.actualMinor, 0), currency)}</strong></div><div className="metric-card"><p>Committed</p><strong>{money(rows.reduce((sum, row) => sum + row.committedMinor, 0), currency)}</strong></div><div className="metric-card"><p>Uncommitted</p><strong>{money(rows.reduce((sum, row) => sum + row.uncommittedMinor, 0), currency)}</strong></div></section>
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">{period?.month_start.slice(0, 7)}</p><h2>Budget lines</h2></div></div><div className="budget-list">{rows.map((row) => <article className="budget-row" key={row.line.id}><div><strong>{row.label}</strong><small>{Math.round(row.utilization * 100)}% used</small><div className="progress-track"><span style={{ width: `${Math.min(100, row.utilization * 100)}%` }}/></div></div><span>Budget {money(row.budgetedMinor, currency)}<br/>Actual {money(row.actualMinor, currency)}<br/>Committed {money(row.committedMinor, currency)}<br/><strong>Uncommitted {money(row.uncommittedMinor, currency)}</strong></span></article>)}{!rows.length ? <div className="inline-empty"><strong>No limits for this month</strong><span>Add a budget line when you want a category to have a clear boundary.</span></div> : null}</div></section>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} eyebrow="Editable plan" title="Add budget line"><form className="money-form" onSubmit={submit}><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)} required><option value="">Choose category</option>{workspace.data.categories.filter((row) => !rows.some((existing) => existing.line.category_id === row.id)).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Monthly limit<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} required/></label>{error ? <p className="field-error">{error}</p> : null}<button className="primary-button" disabled={add.isPending}>Add budget line</button></form><p className="form-help">Groceries + Misc remains combined so migration does not invent an arbitrary split.</p></Drawer>
    </> : null}
  </Page>;
}
