import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ConfirmationDialog } from "~/components/confirmation-dialog";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { budgetsRepository } from "~/data/repositories/budgets-repository";
import { recurringRepository } from "~/data/repositories/recurring-repository";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { parseForecastQuickEntry } from "~/domain/forecast-quick-entry";
import { buildForecastScreenModel } from "~/read-models/forecast";
import { userFacingError } from "~/user-facing-error";

const horizons = [6, 12, 18, 24];
type SettlementDraft = {
  sourceType: "forecast_item" | "recurring_occurrence"; sourceId: string; occurrenceDate: string | null;
  label: string; kind: "income" | "expense" | "transfer"; expectedAmountMinor: number;
  expectedDate: string; sourceAccountId: string | null; destinationAccountId: string | null; categoryId: string | null;
  notes: string | null;
};
function message(error: unknown): string { return userFacingError(error, "Forecast could not be loaded."); }
function money(value: number, currency: string): string { return formatMinorUnits(asMinorUnits(value), currency); }
function dateLabel(value: string): string { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function defaultLocalDate(): string { const value = new Date(); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 10); }

export default function ForecastRoute() {
  const client = useQueryClient();
  const workspace = useQuery({ queryKey: ["forecast-workspace"], queryFn: () => forecastRepository.getWorkspace() });
  const budgets = useQuery({ queryKey: ["budget-workspace"], queryFn: () => budgetsRepository.getWorkspace() });
  const [horizon, setHorizon] = useState<number | null>(null); const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); const [kind, setKind] = useState<"income" | "expense" | "transfer">("expense");
  const [label, setLabel] = useState(""); const [amount, setAmount] = useState(""); const [date, setDate] = useState("");
  const [source, setSource] = useState(""); const [destination, setDestination] = useState(""); const [scenario, setScenario] = useState("");
  const [formError, setFormError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickEntry, setQuickEntry] = useState(""); const [showDetails, setShowDetails] = useState(false);
  const [settlement, setSettlement] = useState<SettlementDraft | null>(null);
  const months = horizon ?? workspace.data?.profile.forecast_horizon_months ?? 12;
  const model = useMemo(() => workspace.data && budgets.data ? buildForecastScreenModel(workspace.data, months, selectedScenarios, undefined, budgets.data) : null, [workspace.data, budgets.data, months, selectedScenarios]);
  const invalidate = () => client.invalidateQueries({ queryKey: ["forecast-workspace"] });
  const save = useMutation({ mutationFn: async () => {
    const amountMinor = Number(parseDisplayAmountToMinor(amount)); if (amountMinor <= 0) throw new Error("Amount must be positive.");
    const payload = { kind, label: label.trim(), amount_minor: amountMinor, expected_date: date, confidence: "expected" as const, scenario_id: scenario || null,
      source_account_id: kind === "income" ? null : source || null, destination_account_id: kind === "expense" ? null : destination || null };
    if (!payload.label || !date) throw new Error("Label and date are required.");
    if (editingId) await forecastRepository.updateItem(editingId, payload); else await forecastRepository.createItem(payload);
  }, onSuccess: () => { setEditingId(null); setLabel(""); setAmount(""); setDate(""); setFormError(""); setDrawerOpen(false); void invalidate(); }, onError: (error) => setFormError(message(error)) });
  const quickSave = useMutation({ mutationFn: async () => {
    const parsed = parseForecastQuickEntry(quickEntry);
    const operatingAccount = workspace.data?.accounts.find((account) => !account.is_system && account.liquidity_class === "operating")
      ?? workspace.data?.accounts.find((account) => !account.is_system && account.name.toLowerCase().includes("operating"));
    if (!operatingAccount) throw new Error("Operating Cash is not available.");
    await forecastRepository.createItem({
      kind: parsed.kind, label: parsed.label, amount_minor: parsed.amountMinor, expected_date: parsed.expectedDate,
      confidence: "expected", scenario_id: null,
      source_account_id: parsed.kind === "expense" ? operatingAccount.id : null,
      destination_account_id: parsed.kind === "income" ? operatingAccount.id : null,
    });
  }, onSuccess: () => { setQuickEntry(""); setFormError(""); setDrawerOpen(false); void invalidate(); }, onError: (error) => setFormError(message(error)) });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: Parameters<typeof forecastRepository.updateItem>[1] }) => forecastRepository.updateItem(id, values), onSuccess: () => void invalidate() });
  const occurrence = useMutation({ mutationFn: (command: { ruleId: string; date: string }) => recurringRepository.setException(command.ruleId, command.date, { status: "skipped" }), onSuccess: () => void invalidate() });
  const settle = useMutation({ mutationFn: async () => {
    if (!settlement) throw new Error("Choose a forecast item first.");
    const command = { actualAmountMinor: settlement.expectedAmountMinor, occurredAt: `${settlement.expectedDate}T12:00:00.000Z`,
      sourceAccountId: settlement.kind === "income" ? null : settlement.sourceAccountId,
      destinationAccountId: settlement.kind === "expense" ? null : settlement.destinationAccountId,
      categoryId: settlement.kind === "transfer" ? null : settlement.categoryId,
      notes: settlement.notes, idempotencyKey: crypto.randomUUID() };
    if (settlement.sourceType === "forecast_item") await forecastRepository.settleItem({ ...command, itemId: settlement.sourceId });
    else await recurringRepository.settleOccurrence({ ...command, ruleId: settlement.sourceId, occurrenceDate: settlement.occurrenceDate! });
  }, onSuccess: () => { setSettlement(null); void Promise.all([
    client.invalidateQueries({ queryKey: ["forecast-workspace"] }), client.invalidateQueries({ queryKey: ["analytics-workspace"] }),
    client.invalidateQueries({ queryKey: ["transactions"] }), client.invalidateQueries({ queryKey: ["accounts"] }),
    client.invalidateQueries({ queryKey: ["budget-workspace"] }),
  ]); } });
  function openCreate() {
    const operatingId = workspace.data?.accounts.find((account) => !account.is_system && account.liquidity_class === "operating")?.id
      ?? workspace.data?.accounts.find((account) => !account.is_system && account.name.toLowerCase().includes("operating"))?.id ?? "";
    setEditingId(null); setQuickEntry(""); setShowDetails(false); setFormError(""); setKind("expense"); setLabel(""); setAmount("");
    setDate(defaultLocalDate()); setSource(operatingId); setDestination(operatingId); setScenario(""); setDrawerOpen(true);
  }
  function beginEdit(id: string) { const item = workspace.data?.items.find((candidate) => candidate.id === id); if (!item) return; setEditingId(id); setShowDetails(true); setKind(item.kind); setLabel(item.label); setAmount((Number(item.amount_minor) / 100).toFixed(2)); setDate(item.expected_date); setSource(item.source_account_id ?? ""); setDestination(item.destination_account_id ?? ""); setScenario(item.scenario_id ?? ""); setDrawerOpen(true); }
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  function beginSettlement(item: NonNullable<typeof model>["timeline"][number]) {
    if (item.sourceType !== "forecast_item" && item.sourceType !== "recurring_occurrence") return;
    setSettlement({ sourceType: item.sourceType, sourceId: item.sourceId, occurrenceDate: item.recurrenceRuleId ? item.canonicalDate : null,
      label: item.label, kind: item.kind, expectedAmountMinor: item.amountMinor, expectedDate: item.date,
      sourceAccountId: item.sourceAccountId, destinationAccountId: item.destinationAccountId, categoryId: item.categoryId,
      notes: item.notes });
  }
  function settlementAction(kind: SettlementDraft["kind"]) { return kind === "income" ? "Mark received" : kind === "expense" ? "Mark paid" : "Mark transferred"; }
  function settlementState(kind: SettlementDraft["kind"]) { return kind === "income" ? "received" : kind === "expense" ? "paid" : "transferred"; }
  const currency = workspace.data?.profile.base_currency ?? "NOK";
  return <Page eyebrow="What happens next" title="Forecast" description="Start with the cash you have now, then see how planned income and spending could change it. Planned money never changes your actual account balances.">
    <div className="forecast-toolbar forecast-controls-toolbar" aria-label="Forecast controls"><div><span>Horizon</span><div className="horizon-options">{horizons.map((value) => <button className={months === value ? "active" : ""} key={value} onClick={() => { setHorizon(value); void forecastRepository.saveHorizon(value); }}>{value} months</button>)}</div></div><div><span>Plans</span><div className="scenario-options">{workspace.data?.scenarios.map((item) => <label key={item.id}><input type="checkbox" checked={selectedScenarios.includes(item.id)} onChange={(event) => setSelectedScenarios((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}/>{item.name}</label>)}</div></div>{model ? <small className="forecast-range"><span>Forecast period</span><strong>{dateLabel(model.result.asOfDate)} – {dateLabel(model.result.endDate)}</strong></small> : null}</div>
    {workspace.isLoading || budgets.isLoading ? <p className="muted">Building forecast…</p> : null}{workspace.error || budgets.error ? <p className="field-error" role="alert">{message(workspace.error ?? budgets.error)}</p> : null}
    {model ? <><section className="forecast-mental-model" aria-label="How this forecast is calculated"><div><span>Starting cash</span><strong>{money(model.summary.startingCashMinor, currency)}</strong><small>Actual money now</small></div><span aria-hidden="true">+</span><a href={`/forecast/assumptions?type=income&horizon=${months}`}><span>Planned income</span><strong>{money(model.summary.incomeMinor, currency)}</strong><small>Review what is included</small></a><span aria-hidden="true">−</span><a href={`/forecast/assumptions?type=expense&horizon=${months}`}><span>Planned spending</span><strong>{money(model.summary.expenseMinor, currency)}</strong><small>Review what is included</small></a><span aria-hidden="true">=</span><div><span>Cash in {months} months</span><strong>{money(model.summary.projectedBalanceMinor, currency)}</strong><small>{dateLabel(model.result.endDate)}</small></div></section>
      <section className="forecast-balance-strip" aria-label="Lowest expected cash balance"><div><p>Lowest cash balance</p><small>The least cash you are projected to have</small></div><strong className={model.result.firstFloorBreach ? "negative" : ""}>{money(model.summary.lowestOperatingMinor, currency)}</strong><span>on {dateLabel(model.result.lowestOperatingCash.date)}</span></section>
      {model.result.overdueItems.length ? <section className="money-panel attention-panel"><div className="panel-heading"><div><p className="section-kicker">Needs attention</p><h2>Overdue plans</h2></div><strong>{model.result.overdueItems.length}</strong></div>{model.result.overdueItems.map((item) => <div className="attention-row" key={item.id}><div><strong>{item.label}</strong><span>{dateLabel(item.date)} · {money(item.amountMinor, currency)}</span></div>{item.sourceType === "forecast_item" ? <div className="row-actions"><button onClick={() => update.mutate({ id: item.sourceId, values: { status: "skipped" } })}>Mark skipped</button><button onClick={() => beginEdit(item.sourceId)}>Reschedule</button></div> : null}</div>)}</section> : null}
      <section className="money-panel timeline-panel">
        <div className="panel-heading"><div><p className="section-kicker">What creates your forecast</p><h2>Upcoming timeline</h2><span className="muted">Expected items only. Mark an item paid or received when it happens.</span></div><div className="timeline-heading-actions"><Link className="secondary-button compact-button" to="/forecast/monthly">{workspace.data?.rules.some((rule) => rule.frequency === "monthly" && rule.interval_count === 1 && !rule.scenario_id) ? "Manage monthly forecast" : "Set up monthly forecast"}</Link><button className="primary-button compact-button" type="button" onClick={openCreate}>Add planned item</button></div></div>
        {model.result.scenario.conflicts.length ? <p className="field-error">Conflicting Plan changes were excluded: {model.result.scenario.conflicts.length}.</p> : null}
        <div className="forecast-list timeline-list">{model.timeline.map((item) => { const planName=workspace.data?.scenarios.find(plan=>plan.id===item.scenarioId)?.name; return <article className={`forecast-row forecast-row-detailed${item.scenarioId?" plan-timeline-item":""}`} key={item.id}>
          <time dateTime={item.date}>{dateLabel(item.date)}</time>
          <div><strong>{item.label}</strong>{planName?<small className="plan-origin">Plan · {planName}</small>:null}</div>
          <div className="timeline-money"><strong className={item.kind === "expense" ? "negative" : item.kind === "income" ? "positive" : ""}>{item.kind === "expense" ? "−" : item.kind === "income" ? "+" : "↔"}{money(item.amountMinor, currency)}</strong><small className="after-event-balance">After event: {money(item.runningBalanceMinor, currency)}</small></div>
          {item.sourceType === "forecast_item" ? <div className="timeline-actions">
            <button className="timeline-settle-action" type="button" onClick={() => beginSettlement(item)}>{settlementAction(item.kind)}</button>
            <details className="timeline-overflow"><summary aria-label={`More actions for ${item.label}`}>⋯</summary><div>
              <button onClick={() => beginEdit(item.sourceId)}>Edit</button>
              <button onClick={() => update.mutate({ id: item.sourceId, values: { status: "skipped" } })}>Skip</button>
              <button onClick={() => update.mutate({ id: item.sourceId, values: { status: "canceled" } })}>Cancel</button>
            </div></details>
          </div> : item.recurrenceRuleId ? <div className="timeline-actions">
            <button className="timeline-settle-action" type="button" onClick={() => beginSettlement(item)}>{settlementAction(item.kind)}</button>
            <details className="timeline-overflow"><summary aria-label={`More actions for ${item.label}`}>⋯</summary><div>
              <button onClick={() => occurrence.mutate({ ruleId: item.recurrenceRuleId!, date: item.canonicalDate })}>Skip this occurrence</button>
            </div></details>
          </div> : null}
        </article>})}</div>
      </section>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} eyebrow="One-off plan" title={editingId ? "Edit planned item" : "Add planned item"}>
        {!editingId && !showDetails ? <form className="money-form quick-plan-form" onSubmit={(event) => { event.preventDefault(); quickSave.mutate(); }}>
          <label>Describe the planned item<input autoFocus value={quickEntry} onChange={(event) => setQuickEntry(event.target.value)} placeholder="Phone bill 568 15 September" required/></label>
          <p className="form-help">Order does not matter. Use <strong>+</strong> for income; otherwise it is an expense. For example: “15 Sep Salary +23000”. Operating Cash is automatic.</p>
          {formError ? <p className="field-error" role="alert">{formError}</p> : null}
          <button className="primary-button" disabled={quickSave.isPending}>{quickSave.isPending ? "Adding…" : "Add to forecast"}</button>
          <button className="secondary-button" type="button" onClick={() => { setShowDetails(true); setFormError(""); }}>More options</button>
        </form> : <form className="money-form" onSubmit={submit}><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label><label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} required/></label><label>Amount<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} required/></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></label>{kind !== "income" ? <label>From account<select value={source} onChange={(event) => setSource(event.target.value)} required><option value="">Choose account</option>{workspace.data?.accounts.filter((account) => !account.is_system).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}{kind !== "expense" ? <label>To account<select value={destination} onChange={(event) => setDestination(event.target.value)} required><option value="">Choose account</option>{workspace.data?.accounts.filter((account) => !account.is_system).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}<label>Plan <span className="optional">optional</span><select value={scenario} onChange={(event) => setScenario(event.target.value)}><option value="">Base forecast</option>{workspace.data?.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{formError ? <p className="field-error" role="alert">{formError}</p> : null}<button className="primary-button" disabled={save.isPending}>{editingId ? "Save changes" : "Add to forecast"}</button>{!editingId ? <button className="secondary-button" type="button" onClick={() => { setShowDetails(false); setFormError(""); }}>Use quick entry</button> : null}</form>}
      </Drawer>
      <ConfirmationDialog open={Boolean(settlement)} onClose={() => setSettlement(null)} eyebrow="Confirm actual money" title={settlement ? `Mark this item as ${settlementState(settlement.kind)}?` : "Confirm item"}>
        {settlement ? <form className="settlement-confirmation" onSubmit={(event) => { event.preventDefault(); settle.mutate(); }}>
          <div className="settlement-confirmation-summary">
            <div><strong>{settlement.label}</strong><small>{dateLabel(settlement.expectedDate)}</small></div>
            <strong className={settlement.kind === "expense" ? "negative" : settlement.kind === "income" ? "positive" : ""}>{settlement.kind === "expense" ? "−" : settlement.kind === "income" ? "+" : "↔"}{money(settlement.expectedAmountMinor, currency)}</strong>
          </div>
          <p className="muted">This records it in Activity and removes it from your forecast.</p>
          {settle.error ? <p className="field-error" role="alert">{userFacingError(settle.error, "This payment could not be recorded.")}</p> : null}
          <div className="confirmation-actions">
            <button className="secondary-button" type="button" onClick={() => setSettlement(null)} disabled={settle.isPending}>Cancel</button>
            <button className="primary-button" disabled={settle.isPending}>{settle.isPending ? "Recording…" : settlementAction(settlement.kind)}</button>
          </div>
        </form> : null}
      </ConfirmationDialog>
    </> : null}
  </Page>;
}
