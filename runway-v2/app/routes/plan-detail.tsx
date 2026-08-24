import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { plansRepository, type ScenarioChangeInsert, type ScenarioChangeRow } from "~/data/repositories/plans-repository";
import type { Database } from "~/data/database.types";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";

type ForecastItemRow = Database["public"]["Tables"]["forecast_items"]["Row"];
function money(value: number, currency: string) { return formatMinorUnits(asMinorUnits(value), currency); }
function itemName(row: ScenarioChangeRow) { return row.label || row.change_type.replaceAll("_", " "); }

export default function PlanDetailRoute() {
  const { planId } = useParams();
  const qc = useQueryClient();
  const workspace = useQuery({ queryKey: ["plans-workspace"], queryFn: () => plansRepository.getWorkspace() });
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [fund, setFund] = useState("");
  const [editing, setEditing] = useState<ScenarioChangeRow | null>(null);
  const [editingForecast, setEditingForecast] = useState<ForecastItemRow | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [error, setError] = useState("");
  const plan = workspace.data?.plans.find(row => row.id === planId);
  const changes = workspace.data?.changes.filter(row => row.scenario_id === planId) ?? [];
  const planItems = workspace.data?.forecast.items.filter(row => row.scenario_id === planId && row.status === "expected") ?? [];
  const planRules = workspace.data?.forecast.rules.filter(row => row.scenario_id === planId && row.active) ?? [];
  const operatingAccount = workspace.data?.forecast.accounts.find(row => !row.is_system && row.archived_at == null && row.class === "asset");
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["plans-workspace"] }), qc.invalidateQueries({ queryKey: ["forecast-workspace"] }), qc.invalidateQueries({ queryKey: ["analytics-workspace"] }), qc.invalidateQueries({ queryKey: ["payday-workspace"] })]);

  function closeItem() { setEditing(null); setEditingForecast(null); setItemOpen(false); setKind("expense"); setLabel(""); setAmount(""); setDate(""); setFund(""); setError(""); }
  function editChange(row: ScenarioChangeRow) { setEditing(row); setEditingForecast(null); setKind(row.change_type.includes("income") ? "income" : "expense"); setLabel(row.label ?? ""); setAmount(row.amount_minor == null ? "" : (Number(row.amount_minor) / 100).toFixed(2)); setDate(row.effective_on ?? ""); setFund(row.fund_id ?? ""); setItemOpen(true); }
  function editForecast(row: ForecastItemRow) { setEditing(null); setEditingForecast(row); setKind(row.kind as "income" | "expense"); setLabel(row.label); setAmount((Number(row.amount_minor) / 100).toFixed(2)); setDate(row.expected_date); setFund(""); setItemOpen(true); }
  function payload(): ScenarioChangeInsert {
    if (!operatingAccount) throw new Error("Operating Cash is unavailable.");
    return { scenario_id: planId!, change_type: `add_one_off_${kind}`, target_forecast_item_id: null, target_recurring_rule_id: null, target_allocation_item_id: null, target_goal_id: null, source_account_id: kind === "expense" ? operatingAccount.id : null, destination_account_id: kind === "income" ? operatingAccount.id : null, category_id: null, fund_id: kind === "expense" && fund ? fund : null, effective_on: date, effective_until: null, amount_minor: Number(parseDisplayAmountToMinor(amount)), label: label.trim(), confidence: "expected", target_field: null, boolean_value: null, frequency: null, interval_count: null, day_of_month: null, day_of_week: null, payload_json: {}, sort_order: changes.length };
  }

  const save = useMutation({ mutationFn: async () => { const values = payload(); if (editingForecast) { await forecastRepository.updateItem(editingForecast.id, { kind, label: values.label!, amount_minor: values.amount_minor!, expected_date: date, source_account_id: values.source_account_id, destination_account_id: values.destination_account_id }); } else if (editing) await plansRepository.updateChange(editing.id, values); else await plansRepository.addChange(values); }, onSuccess: async () => { closeItem(); await refresh(); }, onError: value => setError(value instanceof Error ? value.message : "Plan item could not be saved") });
  const removeChange = useMutation({ mutationFn: (id: string) => plansRepository.removeChange(id), onSuccess: refresh });
  const removeForecast = useMutation({ mutationFn: (id: string) => forecastRepository.updateItem(id, { status: "canceled" }), onSuccess: refresh });
  const editPlan = useMutation({ mutationFn: (values: { name: string; description: string | null; status?: "active" }) => plansRepository.updatePlan(planId!, values), onSuccess: refresh });
  function submit(event: FormEvent) { event.preventDefault(); setError(""); save.mutate(); }

  if (workspace.isLoading) return <Page eyebrow="Plan" title="Loading…" description="Loading Plan items."/>;
  if (!plan) return <Page eyebrow="Plan" title="Plan not found" description="This Plan is unavailable."><Link to="/plans">Back to Plans</Link></Page>;
  const locked = plan.status === "archived" || plan.status === "applied";
  const currency = workspace.data?.forecast.profile.base_currency ?? "NOK";
  const itemCount = changes.length + planItems.length + planRules.length;
  return <Page eyebrow="Plan detail" title={plan.name} description={plan.description || "See the numbers behind this Plan."}>
    <div className="panel-heading detail-actions"><Link to="/plans">← All Plans</Link></div>
    {!locked ? <section className="money-panel compact-plan-details"><p className="section-kicker">Plan details</p><form className="compact-plan-details-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); editPlan.mutate({ name: String(data.get("plan-name") ?? "").trim(), description: String(data.get("plan-description") ?? "").trim() || null }); }}><label>Name<input name="plan-name" defaultValue={plan.name} required/></label><label>Description <span className="optional">optional</span><input name="plan-description" defaultValue={plan.description ?? ""}/></label><button className="primary-button compact-button" disabled={editPlan.isPending}>{editPlan.isPending ? "Saving…" : "Save changes"}</button></form></section> : null}
    <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Plan items</p><h2>What this Plan contains</h2></div><div className="row-actions"><span className="muted">{itemCount}</span>{!locked ? <button className="primary-button compact-button" type="button" onClick={() => { closeItem(); setItemOpen(true); }}>+ Add item</button> : null}</div></div><div className="assumption-list">
      {planItems.map(row => <article className="assumption-row plan-item-row" key={row.id}><div><strong>{row.label}</strong><p>{row.expected_date}</p></div><strong className={row.kind === "expense" ? "negative" : "positive"}>{row.kind === "expense" ? "−" : "+"}{money(Number(row.amount_minor), currency)}</strong>{!locked ? <div className="row-actions"><button type="button" onClick={() => editForecast(row)}>Edit</button><button type="button" onClick={() => removeForecast.mutate(row.id)}>Remove</button></div> : null}</article>)}
      {changes.map(row => <article className="assumption-row plan-item-row" key={row.id}><div><strong>{itemName(row)}</strong><p>{row.effective_on}</p></div>{row.amount_minor != null ? <strong className={row.change_type.includes("expense") ? "negative" : "positive"}>{row.change_type.includes("expense") ? "−" : "+"}{money(Number(row.amount_minor), currency)}</strong> : null}{!locked && (row.change_type === "add_one_off_expense" || row.change_type === "add_one_off_income") ? <div className="row-actions"><button type="button" onClick={() => editChange(row)}>Edit</button><button type="button" onClick={() => removeChange.mutate(row.id)}>Remove</button></div> : null}</article>)}
      {planRules.map(row => <article className="assumption-row plan-item-row" key={row.id}><div><strong>{row.label}</strong><p>Repeats {row.frequency}</p></div><strong>{money(Number(row.amount_minor), currency)}</strong></article>)}
      {!itemCount ? <div className="inline-empty"><strong>No items yet</strong><span>Add an income or expense to see this Plan affect Forecast.</span></div> : null}
    </div></section>
    <Drawer open={itemOpen} onClose={closeItem} eyebrow={editing || editingForecast ? "Edit item" : "New item"} title={editing || editingForecast ? "Change this item" : "Add to this Plan"}><form className="money-form" onSubmit={submit}><label>Type<select value={kind} onChange={event => setKind(event.target.value as "expense" | "income")}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Name<input value={label} onChange={event => setLabel(event.target.value)} placeholder="e.g. Visa fee" required/></label><label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required/></label><label>Date<input type="date" value={date} onChange={event => setDate(event.target.value)} required/></label>{kind === "expense" ? <label>Use a Fund <span className="optional">optional</span><select value={fund} onChange={event => setFund(event.target.value)}><option value="">No Fund</option>{workspace.data?.funds.funds.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label> : null}{error ? <p className="field-error" role="alert">{error}</p> : null}<button className="primary-button" disabled={save.isPending}>{editing || editingForecast ? "Save item" : "Add item"}</button></form></Drawer>
  </Page>;
}
