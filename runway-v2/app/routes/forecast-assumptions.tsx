import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { forecastGroupingRepository } from "~/data/repositories/forecast-grouping-repository";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { budgetsRepository } from "~/data/repositories/budgets-repository";
import { groupForecastOccurrences, type ForecastOccurrenceGroup } from "~/domain/forecast-grouping";
import { forecast } from "~/domain/forecast";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { toForecastInput } from "~/read-models/forecast";
import { userFacingError } from "~/user-facing-error";

type AssumptionKind = "income" | "expense";
function money(value: number, currency: string) { return formatMinorUnits(asMinorUnits(Math.trunc(value)), currency); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function groupAmountLabel(group: ForecastOccurrenceGroup, currency: string): string {
  const amount = group.minimumAmountMinor === group.maximumAmountMinor
    ? money(group.minimumAmountMinor, currency)
    : `${money(group.minimumAmountMinor, currency)}–${money(group.maximumAmountMinor, currency)}`;
  return `${amount} · ${group.occurrences.length} occurrence${group.occurrences.length === 1 ? "" : "s"}`;
}

export default function ForecastAssumptionsRoute() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["forecast-workspace"], queryFn: () => forecastRepository.getWorkspace() });
  const budgets = useQuery({ queryKey: ["budget-workspace"], queryFn: () => budgetsRepository.getWorkspace() });
  const grouping = useQuery({ queryKey: ["forecast-grouping"], queryFn: () => forecastGroupingRepository.list() });
  const [params, setParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState(""); const [amount, setAmount] = useState(""); const [date, setDate] = useState("");
  const [confidence, setConfidence] = useState<"committed" | "expected" | "tentative">("expected"); const [error, setError] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const kind: AssumptionKind = params.get("type") === "income" ? "income" : "expense";
  const months = Math.max(1, Number(params.get("horizon") ?? query.data?.profile.forecast_horizon_months ?? 12));
  const data = query.data;
  const result = useMemo(() => data && budgets.data ? forecast(toForecastInput(data, months, [], undefined, budgets.data)) : null, [data, budgets.data, months]);
  const occurrences = useMemo(() => result?.events.filter((item) => item.kind === kind).map((item) => ({
    id: item.id,
    label: item.label,
    kind,
    date: item.date,
    amountMinor: item.amountMinor,
    sourceType: item.sourceType === "recurring_occurrence" ? "recurring_occurrence" as const : item.sourceType === "budget_remaining" ? "budget_remaining" as const : "forecast_item" as const,
    sourceId: item.sourceId,
  })) ?? [], [result, kind]);
  const groups = useMemo(() => groupForecastOccurrences(occurrences, grouping.data?.aliases ?? [], grouping.data?.names ?? []), [occurrences, grouping.data]);
  const planItems = useMemo(() => data?.items.filter((item) => item.kind === kind && item.status === "expected" && Boolean(item.scenario_id)) ?? [], [data, kind]);

  const save = useMutation({ mutationFn: async () => {
    if (!editingId || !label.trim() || !date) throw new Error("Name and date are required.");
    const amountMinor = Number(parseDisplayAmountToMinor(amount)); if (amountMinor <= 0) throw new Error("Amount must be positive.");
    await forecastRepository.updateItem(editingId, { label: label.trim(), amount_minor: amountMinor, expected_date: date, confidence });
  }, onSuccess: () => { setEditingId(null); setError(""); void client.invalidateQueries({ queryKey: ["forecast-workspace"] }); }, onError: (value) => setError(userFacingError(value, "This assumption could not be saved.")) });
  const remove = useMutation({ mutationFn: (id: string) => forecastRepository.updateItem(id, { status: "canceled" }), onSuccess: () => { setEditingId(null); void client.invalidateQueries({ queryKey: ["forecast-workspace"] }); } });
  const rename = useMutation({ mutationFn: ({ groupKey, name }: { groupKey: string; name: string }) => forecastGroupingRepository.rename(kind, groupKey, name), onSuccess: () => void client.invalidateQueries({ queryKey: ["forecast-grouping"] }) });
  const merge = useMutation({ mutationFn: ({ group, target }: { group: ForecastOccurrenceGroup; target: string }) => forecastGroupingRepository.merge(kind, group.labelVariants.map((variant) => variant.labelKey), target), onSuccess: () => void client.invalidateQueries({ queryKey: ["forecast-grouping"] }) });
  const separate = useMutation({ mutationFn: ({ labelKey, name }: { labelKey: string; name: string }) => forecastGroupingRepository.separate(kind, labelKey, name), onSuccess: () => void client.invalidateQueries({ queryKey: ["forecast-grouping"] }) });

  function edit(id: string) { const item = data?.items.find((row) => row.id === id); if (!item) return; setEditingId(id); setLabel(item.label); setAmount((Number(item.amount_minor) / 100).toFixed(2)); setDate(item.expected_date); setConfidence(item.confidence); }
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  const currency = data?.profile.base_currency ?? "NOK";
  return <Page className="forecast-breakdown-page" eyebrow="Planned money" title="Forecast breakdown" description="Review the income and spending included in your forecast.">
    <div className="assumption-view-switcher"><Link to="/forecast">← Back to Forecast</Link><div className="horizon-options" role="tablist" aria-label="Breakdown type"><button className={kind === "income" ? "active" : ""} onClick={() => setParams({ type: "income", horizon: String(months) })}>Income</button><button className={kind === "expense" ? "active" : ""} onClick={() => setParams({ type: "expense", horizon: String(months) })}>Spending</button></div><span aria-hidden="true"/></div>
    {query.isLoading || budgets.isLoading || grouping.isLoading ? <p className="muted">Loading breakdown…</p> : null}
    {query.error || budgets.error || grouping.error ? <p className="field-error">The forecast breakdown could not be loaded.</p> : null}
    {data && result ? <>
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Included in Forecast</p><h2>{kind === "income" ? "Expected income" : "Expected spending"}</h2></div><Link to="/forecast/monthly">Manage monthly forecast →</Link></div>
        <div className="assumption-list">{groups.map((group) => <article className="assumption-group" key={`${kind}:${group.key}`}>
          <div><strong>{group.name}</strong><span>{groupAmountLabel(group, currency)}</span></div>
          <details><summary>Review dates</summary><div className="assumption-occurrences">{group.occurrences.map((item) => item.sourceType === "forecast_item" ? <button key={item.id} onClick={() => edit(item.sourceId)}><span>{dateLabel(item.date)}</span><strong>{money(item.amountMinor, currency)}</strong></button> : <div className="assumption-occurrence" key={item.id}><span>{dateLabel(item.date)}</span><strong>{money(item.amountMinor, currency)}</strong></div>)}</div></details>
          <details className="assumption-corrections"><summary>Adjust grouping</summary><div className="assumption-correction-panel">
            <label>Group name<input aria-label={`Rename ${group.name}`} value={renameDrafts[group.key] ?? group.name} onChange={(event) => setRenameDrafts((current) => ({ ...current, [group.key]: event.target.value }))}/></label>
            <button type="button" disabled={rename.isPending} onClick={() => rename.mutate({ groupKey: group.key, name: renameDrafts[group.key] ?? group.name })}>Rename group</button>
            {groups.length > 1 ? <><label>Merge into<select aria-label={`Merge ${group.name} into`} value={mergeTargets[group.key] ?? ""} onChange={(event) => setMergeTargets((current) => ({ ...current, [group.key]: event.target.value }))}><option value="">Choose another group</option>{groups.filter((candidate) => candidate.key !== group.key).map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.name}</option>)}</select></label><button type="button" disabled={!mergeTargets[group.key] || merge.isPending} onClick={() => merge.mutate({ group, target: mergeTargets[group.key]! })}>Merge groups</button></> : null}
            {group.labelVariants.length > 1 ? <div className="separate-variations"><span>Keep a variation separate</span>{group.labelVariants.map((variant) => <button type="button" key={variant.labelKey} disabled={separate.isPending} onClick={() => separate.mutate({ labelKey: variant.labelKey, name: variant.label })}>{variant.label}</button>)}</div> : null}
            {rename.error || merge.error || separate.error ? <p className="field-error">That grouping change could not be saved.</p> : null}
          </div></details>
        </article>)}</div>
        {!groups.length ? <div className="inline-empty"><strong>No {kind} assumptions in this period</strong><span>Add a one-off item or set up your monthly forecast.</span></div> : null}
      </section>
      {planItems.length ? <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Plans</p><h2>Plan-only items</h2></div><Link to="/plans">Open Plans →</Link></div><p className="muted">{planItems.length} item{planItems.length === 1 ? "" : "s"} are excluded from the base forecast until their Plan is selected.</p></section> : null}
      <Drawer open={Boolean(editingId)} onClose={() => setEditingId(null)} eyebrow="Forecast only" title="Edit assumption"><form className="money-form" onSubmit={submit}><label>Name<input value={label} onChange={(event) => setLabel(event.target.value)} required/></label><label>Amount<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} required/></label><label>Expected date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></label><label>How certain is this?<select value={confidence} onChange={(event) => setConfidence(event.target.value as typeof confidence)}><option value="committed">Committed</option><option value="expected">Expected</option><option value="tentative">Tentative</option></select></label>{error ? <p className="field-error">{error}</p> : null}<button className="primary-button" disabled={save.isPending}>Save change</button><button className="quiet-button" type="button" disabled={remove.isPending} onClick={() => editingId && remove.mutate(editingId)}>Remove from forecast</button></form></Drawer>
    </> : null}
  </Page>;
}
