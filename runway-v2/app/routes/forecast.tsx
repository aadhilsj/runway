import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { recurringRepository } from "~/data/repositories/recurring-repository";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { buildForecastScreenModel } from "~/read-models/forecast";
import { userFacingError } from "~/user-facing-error";

const horizons = [6, 12, 18, 24];
type SettlementDraft = {
  sourceType: "forecast_item" | "recurring_occurrence"; sourceId: string; occurrenceDate: string | null;
  label: string; kind: "income" | "expense" | "transfer"; expectedAmountMinor: number;
  expectedDate: string; sourceAccountId: string | null; destinationAccountId: string | null; categoryId: string | null;
};
function message(error: unknown): string { return userFacingError(error, "Forecast could not be loaded."); }
function money(value: number, currency: string): string { return formatMinorUnits(asMinorUnits(value), currency); }
function dateLabel(value: string): string { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }

export default function ForecastRoute() {
  const client = useQueryClient();
  const workspace = useQuery({ queryKey: ["forecast-workspace"], queryFn: () => forecastRepository.getWorkspace() });
  const [horizon, setHorizon] = useState<number | null>(null); const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); const [kind, setKind] = useState<"income" | "expense" | "transfer">("expense");
  const [label, setLabel] = useState(""); const [amount, setAmount] = useState(""); const [date, setDate] = useState("");
  const [source, setSource] = useState(""); const [destination, setDestination] = useState(""); const [scenario, setScenario] = useState("");
  const [confidence, setConfidence] = useState<"committed" | "expected" | "tentative">("expected"); const [formError, setFormError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settlement, setSettlement] = useState<SettlementDraft | null>(null);
  const [actualAmount, setActualAmount] = useState(""); const [actualDate, setActualDate] = useState("");
  const [actualSource, setActualSource] = useState(""); const [actualDestination, setActualDestination] = useState("");
  const [actualCategory, setActualCategory] = useState(""); const [actualNotes, setActualNotes] = useState("");
  const [settlementError, setSettlementError] = useState("");
  const months = horizon ?? workspace.data?.profile.forecast_horizon_months ?? 12;
  const model = useMemo(() => workspace.data ? buildForecastScreenModel(workspace.data, months, selectedScenarios) : null, [workspace.data, months, selectedScenarios]);
  const invalidate = () => client.invalidateQueries({ queryKey: ["forecast-workspace"] });
  const save = useMutation({ mutationFn: async () => {
    const amountMinor = Number(parseDisplayAmountToMinor(amount)); if (amountMinor <= 0) throw new Error("Amount must be positive.");
    const payload = { kind, label: label.trim(), amount_minor: amountMinor, expected_date: date, confidence, scenario_id: scenario || null,
      source_account_id: kind === "income" ? null : source || null, destination_account_id: kind === "expense" ? null : destination || null };
    if (!payload.label || !date) throw new Error("Label and date are required.");
    if (editingId) await forecastRepository.updateItem(editingId, payload); else await forecastRepository.createItem(payload);
  }, onSuccess: () => { setEditingId(null); setLabel(""); setAmount(""); setDate(""); setFormError(""); setDrawerOpen(false); void invalidate(); }, onError: (error) => setFormError(message(error)) });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: Parameters<typeof forecastRepository.updateItem>[1] }) => forecastRepository.updateItem(id, values), onSuccess: () => void invalidate() });
  const match = useMutation({ mutationFn: ({ itemId, transactionId }: { itemId: string; transactionId: string }) => forecastRepository.matchItem(itemId, transactionId), onSuccess: () => void invalidate() });
  const occurrence = useMutation({ mutationFn: (command: { ruleId: string; date: string; transactionId?: string }) => command.transactionId ? recurringRepository.matchOccurrence(command.ruleId, command.date, command.transactionId) : recurringRepository.setException(command.ruleId, command.date, { status: "skipped" }), onSuccess: () => void invalidate() });
  const settle = useMutation({ mutationFn: async () => {
    if (!settlement) throw new Error("Choose a forecast item first.");
    const actualAmountMinor = Number(parseDisplayAmountToMinor(actualAmount));
    if (actualAmountMinor <= 0 || !actualDate) throw new Error("Enter the exact amount and date.");
    const command = { actualAmountMinor, occurredAt: `${actualDate}T12:00:00.000Z`,
      sourceAccountId: settlement.kind === "income" ? null : actualSource || null,
      destinationAccountId: settlement.kind === "expense" ? null : actualDestination || null,
      categoryId: settlement.kind === "transfer" ? null : actualCategory || null,
      notes: actualNotes.trim() || null, idempotencyKey: crypto.randomUUID() };
    if (settlement.sourceType === "forecast_item") await forecastRepository.settleItem({ ...command, itemId: settlement.sourceId });
    else await recurringRepository.settleOccurrence({ ...command, ruleId: settlement.sourceId, occurrenceDate: settlement.occurrenceDate! });
  }, onSuccess: () => { setSettlement(null); setSettlementError(""); void Promise.all([
    client.invalidateQueries({ queryKey: ["forecast-workspace"] }), client.invalidateQueries({ queryKey: ["analytics-workspace"] }),
    client.invalidateQueries({ queryKey: ["transactions"] }), client.invalidateQueries({ queryKey: ["accounts"] }),
  ]); }, onError: (error) => setSettlementError(userFacingError(error, "This payment could not be recorded.")) });
  function beginEdit(id: string) { const item = workspace.data?.items.find((candidate) => candidate.id === id); if (!item) return; setEditingId(id); setKind(item.kind); setLabel(item.label); setAmount((Number(item.amount_minor) / 100).toFixed(2)); setDate(item.expected_date); setSource(item.source_account_id ?? ""); setDestination(item.destination_account_id ?? ""); setScenario(item.scenario_id ?? ""); setConfidence(item.confidence); setDrawerOpen(true); }
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  function beginSettlement(item: NonNullable<typeof model>["timeline"][number]) {
    if (item.sourceType === "scenario_item") return;
    setSettlement({ sourceType: item.sourceType, sourceId: item.sourceId, occurrenceDate: item.recurrenceRuleId ? item.canonicalDate : null,
      label: item.label, kind: item.kind, expectedAmountMinor: item.amountMinor, expectedDate: item.date,
      sourceAccountId: item.sourceAccountId, destinationAccountId: item.destinationAccountId, categoryId: item.categoryId });
    setActualAmount((item.amountMinor / 100).toFixed(2)); setActualDate(item.date); setActualSource(item.sourceAccountId ?? "");
    setActualDestination(item.destinationAccountId ?? ""); setActualCategory(item.categoryId ?? ""); setActualNotes(item.notes ?? ""); setSettlementError("");
  }
  function settlementAction(kind: SettlementDraft["kind"]) { return kind === "income" ? "Mark received" : kind === "expense" ? "Mark paid" : "Mark transferred"; }
  const currency = workspace.data?.profile.base_currency ?? "NOK";
  return <Page eyebrow="What happens next" title="Forecast" description="Start with the cash you have now, then see how planned income and spending could change it. Planned money never changes your actual account balances.">
    <div className="forecast-toolbar" aria-label="Forecast controls"><div><span>Horizon</span><div className="horizon-options">{horizons.map((value) => <button className={months === value ? "active" : ""} key={value} onClick={() => { setHorizon(value); void forecastRepository.saveHorizon(value); }}>{value} months</button>)}</div></div><div><span>Scenarios</span><div className="scenario-options">{workspace.data?.scenarios.map((item) => <label key={item.id}><input type="checkbox" checked={selectedScenarios.includes(item.id)} onChange={(event) => setSelectedScenarios((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}/>{item.name}</label>)}</div></div>{model ? <small>As of {dateLabel(model.result.asOfDate)} · through {dateLabel(model.result.endDate)}</small> : null}</div>
    {workspace.isLoading ? <p className="muted">Building forecast…</p> : null}{workspace.error ? <p className="field-error" role="alert">{message(workspace.error)}</p> : null}
    {model ? <><section className="forecast-mental-model" aria-label="How this forecast is calculated"><div><span>Starting cash</span><strong>{money(model.summary.startingCashMinor, currency)}</strong><small>Actual money now</small></div><span aria-hidden="true">+</span><a href={`/forecast/assumptions?type=income&horizon=${months}`}><span>Planned income</span><strong>{money(model.summary.incomeMinor, currency)}</strong><small>Review what is included</small></a><span aria-hidden="true">−</span><a href={`/forecast/assumptions?type=expense&horizon=${months}`}><span>Planned spending</span><strong>{money(model.summary.expenseMinor, currency)}</strong><small>Review what is included</small></a><span aria-hidden="true">=</span><div><span>Cash in {months} months</span><strong>{money(model.summary.projectedBalanceMinor, currency)}</strong><small>{dateLabel(model.result.endDate)}</small></div></section>
      <section className="forecast-lowest-balance" aria-label="Lowest expected cash balance"><div className="metric-card"><p>Lowest cash balance</p><strong className={model.result.firstFloorBreach ? "negative" : ""}>{money(model.summary.lowestOperatingMinor, currency)}</strong><small>{dateLabel(model.result.lowestOperatingCash.date)}</small></div></section>
      {model.result.overdueItems.length ? <section className="money-panel attention-panel"><div className="panel-heading"><div><p className="section-kicker">Needs attention</p><h2>Overdue plans</h2></div><strong>{model.result.overdueItems.length}</strong></div>{model.result.overdueItems.map((item) => <div className="attention-row" key={item.id}><div><strong>{item.label}</strong><span>{dateLabel(item.date)} · {money(item.amountMinor, currency)}</span></div>{item.sourceType === "forecast_item" ? <div className="row-actions"><button onClick={() => update.mutate({ id: item.sourceId, values: { status: "skipped" } })}>Mark skipped</button><button onClick={() => beginEdit(item.sourceId)}>Reschedule</button></div> : null}</div>)}</section> : null}
      <section className="money-panel timeline-panel">
        <div className="panel-heading"><div><p className="section-kicker">What creates your forecast</p><h2>Upcoming timeline</h2><span className="muted">Expected items only. Mark an item paid or received when it happens.</span></div><div className="timeline-heading-actions"><button className="primary-button" type="button" onClick={() => { setEditingId(null); setDrawerOpen(true); }}>Add planned item</button></div></div>
        {model.result.scenario.conflicts.length ? <p className="field-error">Conflicting scenario changes were excluded: {model.result.scenario.conflicts.length}.</p> : null}
        <div className="forecast-list timeline-list">{model.timeline.map((item) => <article className="forecast-row forecast-row-detailed" key={item.id}>
          <time dateTime={item.date}>{dateLabel(item.date)}</time>
          <div><strong>{item.label}</strong><span>{item.accountImpact} · {item.confidence}{item.recurrenceRuleId ? " · Recurring" : ""}{item.scenarioId ? " · Scenario" : ""}</span><small>Running operating cash {money(item.runningBalanceMinor, currency)}</small></div>
          <strong className={item.kind === "expense" ? "negative" : item.kind === "income" ? "positive" : ""}>{item.kind === "expense" ? "−" : item.kind === "income" ? "+" : "↔"}{money(item.amountMinor, currency)}</strong>
          {item.sourceType === "forecast_item" ? <div className="timeline-actions">
            <button className="primary-button compact-button" type="button" onClick={() => beginSettlement(item)}>{settlementAction(item.kind)}</button>
            <details className="timeline-overflow"><summary aria-label={`More actions for ${item.label}`}>More</summary><div>
              <button onClick={() => beginEdit(item.sourceId)}>Edit</button>
              <button onClick={() => update.mutate({ id: item.sourceId, values: { status: "skipped" } })}>Skip</button>
              <button onClick={() => update.mutate({ id: item.sourceId, values: { status: "canceled" } })}>Cancel</button>
              <select aria-label={`Match ${item.label}`} defaultValue="" onChange={(event) => event.target.value && match.mutate({ itemId: item.sourceId, transactionId: event.target.value })}><option value="">Match transaction…</option>{workspace.data?.transactions.map((transaction) => <option key={transaction.id} value={transaction.id}>{transaction.description} · {dateLabel(transaction.occurred_at.slice(0, 10))}</option>)}</select>
            </div></details>
          </div> : item.recurrenceRuleId ? <div className="timeline-actions">
            <button className="primary-button compact-button" type="button" onClick={() => beginSettlement(item)}>{settlementAction(item.kind)}</button>
            <details className="timeline-overflow"><summary aria-label={`More actions for ${item.label}`}>More</summary><div>
              <button onClick={() => occurrence.mutate({ ruleId: item.recurrenceRuleId!, date: item.canonicalDate })}>Skip this occurrence</button>
              <select aria-label={`Match recurring ${item.label}`} defaultValue="" onChange={(event) => event.target.value && occurrence.mutate({ ruleId: item.recurrenceRuleId!, date: item.canonicalDate, transactionId: event.target.value })}><option value="">Match transaction…</option>{workspace.data?.transactions.map((transaction) => <option key={transaction.id} value={transaction.id}>{transaction.description} · {dateLabel(transaction.occurred_at.slice(0, 10))}</option>)}</select>
            </div></details>
          </div> : null}
        </article>)}</div>
      </section>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} eyebrow="One-off plan" title={editingId ? "Edit planned item" : "Add planned item"}><form className="money-form" onSubmit={submit}><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label><label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} required/></label><label>Amount<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} required/></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></label>{kind !== "income" ? <label>From account<select value={source} onChange={(event) => setSource(event.target.value)} required><option value="">Choose account</option>{workspace.data?.accounts.filter((account) => !account.is_system).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}{kind !== "expense" ? <label>To account<select value={destination} onChange={(event) => setDestination(event.target.value)} required><option value="">Choose account</option>{workspace.data?.accounts.filter((account) => !account.is_system).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}<label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value as typeof confidence)}><option value="committed">Committed</option><option value="expected">Expected</option><option value="tentative">Tentative</option></select></label><label>Scenario <span className="optional">optional</span><select value={scenario} onChange={(event) => setScenario(event.target.value)}><option value="">Base plan</option>{workspace.data?.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{formError ? <p className="field-error" role="alert">{formError}</p> : null}<button className="primary-button" disabled={save.isPending}>{editingId ? "Save changes" : "Add to forecast"}</button></form></Drawer>
      <Drawer open={Boolean(settlement)} onClose={() => setSettlement(null)} eyebrow="Record actual money" title={settlement ? settlementAction(settlement.kind) : "Record payment"}>
        {settlement ? <form className="money-form" onSubmit={(event) => { event.preventDefault(); settle.mutate(); }}>
          <div className="settlement-expected"><span>Forecast</span><strong>{settlement.label}</strong><small>{money(settlement.expectedAmountMinor, currency)} expected on {dateLabel(settlement.expectedDate)}</small></div>
          <label>Exact amount<input value={actualAmount} inputMode="decimal" onChange={(event) => setActualAmount(event.target.value)} required/></label>
          <label>Actual date<input type="date" value={actualDate} onChange={(event) => setActualDate(event.target.value)} required/></label>
          {settlement.kind !== "income" ? <label>From account<select value={actualSource} onChange={(event) => setActualSource(event.target.value)} required><option value="">Choose account</option>{workspace.data?.accounts.filter((account) => !account.is_system).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}
          {settlement.kind !== "expense" ? <label>To account<select value={actualDestination} onChange={(event) => setActualDestination(event.target.value)} required><option value="">Choose account</option>{workspace.data?.accounts.filter((account) => !account.is_system).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}
          {settlement.kind !== "transfer" ? <label>Category<select value={actualCategory} onChange={(event) => setActualCategory(event.target.value)} required><option value="">Choose category</option>{workspace.data?.categories.filter((category) => category.kind === settlement.kind).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label> : null}
          <label>Note <span className="optional">optional</span><textarea value={actualNotes} onChange={(event) => setActualNotes(event.target.value)}/></label>
          <p className="muted">This records the real transaction once and removes the planned item from your active forecast.</p>
          {settlementError ? <p className="field-error" role="alert">{settlementError}</p> : null}
          <button className="primary-button" disabled={settle.isPending}>{settle.isPending ? "Recording…" : settlementAction(settlement.kind)}</button>
        </form> : null}
      </Drawer>
    </> : null}
  </Page>;
}
