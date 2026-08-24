import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { addMonthsClamped } from "~/domain/forecast";
import { calendarDateInTimezone } from "~/read-models/forecast";
import { userFacingError } from "~/user-facing-error";

type AssumptionKind = "income" | "expense";
function money(value: number, currency: string) { return formatMinorUnits(asMinorUnits(Math.trunc(value)), currency); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }

export default function ForecastAssumptionsRoute() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["forecast-workspace"], queryFn: () => forecastRepository.getWorkspace() });
  const [params, setParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState(""); const [amount, setAmount] = useState(""); const [date, setDate] = useState("");
  const [confidence, setConfidence] = useState<"committed" | "expected" | "tentative">("expected"); const [error, setError] = useState("");
  const kind: AssumptionKind = params.get("type") === "income" ? "income" : "expense";
  const months = Math.max(1, Number(params.get("horizon") ?? query.data?.profile.forecast_horizon_months ?? 12));
  const data = query.data;
  const today = data ? calendarDateInTimezone(data.profile.timezone) : "";
  const end = today ? addMonthsClamped(today, months) : "";
  const visible = useMemo(() => data?.items.filter((item) => item.kind === kind && item.status === "expected" && item.expected_date >= today && item.expected_date <= end) ?? [], [data, kind, today, end]);
  const baseItems = visible.filter((item) => !item.scenario_id);
  const planItems = visible.filter((item) => item.scenario_id);
  const groups = useMemo(() => {
    const map = new Map<string, typeof baseItems>();
    for (const item of baseItems) { const key = `${item.label.trim().toLocaleLowerCase()}:${Number(item.amount_minor)}`; map.set(key, [...(map.get(key) ?? []), item]); }
    return [...map.values()].sort((a, b) => a[0]!.expected_date.localeCompare(b[0]!.expected_date));
  }, [baseItems]);
  const save = useMutation({ mutationFn: async () => {
    if (!editingId || !label.trim() || !date) throw new Error("Name and date are required.");
    const amountMinor = Number(parseDisplayAmountToMinor(amount)); if (amountMinor <= 0) throw new Error("Amount must be positive.");
    await forecastRepository.updateItem(editingId, { label: label.trim(), amount_minor: amountMinor, expected_date: date, confidence });
  }, onSuccess: () => { setEditingId(null); setError(""); void client.invalidateQueries({ queryKey: ["forecast-workspace"] }); }, onError: (value) => setError(userFacingError(value, "This assumption could not be saved.")) });
  const remove = useMutation({ mutationFn: (id: string) => forecastRepository.updateItem(id, { status: "canceled" }), onSuccess: () => { setEditingId(null); void client.invalidateQueries({ queryKey: ["forecast-workspace"] }); } });
  function edit(id: string) { const item = data?.items.find((row) => row.id === id); if (!item) return; setEditingId(id); setLabel(item.label); setAmount((Number(item.amount_minor) / 100).toFixed(2)); setDate(item.expected_date); setConfidence(item.confidence); }
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  const currency = data?.profile.base_currency ?? "NOK";
  const total = visible.reduce((sum, item) => sum + Number(item.amount_minor), 0);
  return <Page eyebrow="What the forecast assumes" title="Forecast assumptions" description="Review the planned income and spending behind your chart. Changes here affect only the forecast—not the money in your accounts.">
    <div className="panel-heading"><Link to="/forecast">← Back to Forecast</Link><span className="muted">{dateLabel(today || new Date().toISOString().slice(0,10))} to {end ? dateLabel(end) : "…"}</span></div>
    <div className="horizon-options" role="tablist" aria-label="Assumption type"><button className={kind === "income" ? "active" : ""} onClick={() => setParams({ type: "income", horizon: String(months) })}>Income</button><button className={kind === "expense" ? "active" : ""} onClick={() => setParams({ type: "expense", horizon: String(months) })}>Spending</button></div>
    {query.isLoading ? <p className="muted">Loading assumptions…</p> : null}
    {query.error ? <p className="field-error">Assumptions could not be loaded.</p> : null}
    {data ? <>
      <section className="actual-planned-strip"><div><strong>{visible.length} planned {kind === "income" ? "payments in" : "payments out"}</strong><span>{money(total, currency)} over the next {months} months</span></div><div><strong>Not actual yet</strong><span>These amounts do not change Total Cash until you record them in Activity.</span></div></section>
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Base forecast</p><h2>{kind === "income" ? "Expected income" : "Expected spending"}</h2></div></div>
        <div className="assumption-list">{groups.map((items) => { const first = items[0]!; return <article className="assumption-group" key={`${first.label}:${first.amount_minor}`}><div><strong>{first.label}</strong><span>{money(Number(first.amount_minor), currency)}{items.length > 1 ? ` · ${items.length} occurrences` : ` · ${dateLabel(first.expected_date)}`}</span></div>{items.length > 1 ? <details><summary>Review dates</summary><div className="assumption-occurrences">{items.map((item) => <button key={item.id} onClick={() => edit(item.id)}><span>{dateLabel(item.expected_date)}</span><strong>{money(Number(item.amount_minor), currency)}</strong></button>)}</div></details> : <button onClick={() => edit(first.id)}>Edit</button>}</article>; })}</div>
        {!groups.length ? <div className="inline-empty"><strong>No {kind} assumptions in this period</strong><span>Add planned items from Forecast when something is expected.</span></div> : null}
      </section>
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Repeating automatically</p><h2>Monthly forecast</h2></div><Link to="/forecast/monthly">Manage monthly forecast →</Link></div><p className="muted">{data.rules.filter((rule) => rule.active && rule.frequency === "monthly" && rule.interval_count === 1 && rule.kind === kind).length} monthly {kind} item{data.rules.filter((rule) => rule.active && rule.frequency === "monthly" && rule.interval_count === 1 && rule.kind === kind).length === 1 ? "" : "s"}. {kind === "income" ? "Expected income appears on its usual day but is never counted as actual cash before receipt." : "Use the monthly forecast for payments that repeat on the same usual day."}</p></section>
      {planItems.length ? <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Plans</p><h2>Plan-only items</h2></div><Link to="/plans">Open Plans →</Link></div><p className="muted">{planItems.length} item{planItems.length === 1 ? "" : "s"} are excluded from the base forecast until their Plan is selected.</p></section> : null}
      <Drawer open={Boolean(editingId)} onClose={() => setEditingId(null)} eyebrow="Forecast only" title="Edit assumption"><form className="money-form" onSubmit={submit}><label>Name<input value={label} onChange={(event) => setLabel(event.target.value)} required/></label><label>Amount<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} required/></label><label>Expected date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></label><label>How certain is this?<select value={confidence} onChange={(event) => setConfidence(event.target.value as typeof confidence)}><option value="committed">Committed</option><option value="expected">Expected</option><option value="tentative">Tentative</option></select></label>{error ? <p className="field-error">{error}</p> : null}<button className="primary-button" disabled={save.isPending}>Save change</button><button className="quiet-button" type="button" disabled={remove.isPending} onClick={() => editingId && remove.mutate(editingId)}>Remove from forecast</button></form></Drawer>
    </> : null}
  </Page>;
}
