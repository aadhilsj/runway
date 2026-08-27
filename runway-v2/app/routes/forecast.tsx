import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ConfirmationDialog } from "~/components/confirmation-dialog";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { budgetsRepository } from "~/data/repositories/budgets-repository";
import { plansRepository } from "~/data/repositories/plans-repository";
import { recurringRepository } from "~/data/repositories/recurring-repository";
import { reimbursementsRepository } from "~/data/repositories/reimbursements-repository";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { parseForecastQuickEntry } from "~/domain/forecast-quick-entry";
import { buildForecastScreenModel, buildForecastScreenModelFromResult } from "~/read-models/forecast";
import { buildSelectedPlansEvaluation } from "~/read-models/plans";
import { userFacingError } from "~/user-facing-error";

const horizons = [6, 12, 18, 24];
type SettlementDraft = {
  sourceType: "forecast_item" | "recurring_occurrence" | "plan_change" | "plan_forecast_item"; sourceId: string; occurrenceDate: string | null;
  label: string; kind: "income" | "expense" | "transfer"; expectedAmountMinor: number;
  expectedDate: string; sourceAccountId: string | null; destinationAccountId: string | null; categoryId: string | null;
  notes: string | null; planName: string | null;
  reimbursementPoolId: string | null;
};
function message(error: unknown): string { return userFacingError(error, "Forecast could not be loaded."); }
function money(value: number, currency: string): string { return formatMinorUnits(asMinorUnits(value), currency); }
function dateLabel(value: string): string { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function monthLabel(value: string): string { return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`)); }
function defaultLocalDate(): string { const value = new Date(); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 10); }
function withinRecoveryWindow(updatedAt: string): boolean { return Date.parse(updatedAt) >= Date.now() - 30 * 86_400_000; }

export default function ForecastRoute() {
  const client = useQueryClient();
  const workspace = useQuery({ queryKey: ["forecast-workspace"], queryFn: () => forecastRepository.getWorkspace() });
  const budgets = useQuery({ queryKey: ["budget-workspace"], queryFn: () => budgetsRepository.getWorkspace() });
  const [horizon, setHorizon] = useState<number | null>(null); const [planSelectionOverrides, setPlanSelectionOverrides] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null); const [kind, setKind] = useState<"income" | "expense" | "transfer">("expense");
  const [label, setLabel] = useState(""); const [amount, setAmount] = useState(""); const [date, setDate] = useState("");
  const [source, setSource] = useState(""); const [destination, setDestination] = useState(""); const [scenario, setScenario] = useState("");
  const [formError, setFormError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickEntry, setQuickEntry] = useState(""); const [showDetails, setShowDetails] = useState(false);
  const [settlement, setSettlement] = useState<SettlementDraft | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [reimbursementEditId, setReimbursementEditId] = useState<string | null>(null);
  const [reimbursementTotal, setReimbursementTotal] = useState("");
  const [reimbursementDate, setReimbursementDate] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const months = horizon ?? workspace.data?.profile.forecast_horizon_months ?? 12;
  const horizonOptions = horizons.includes(months) ? horizons : [...horizons, months].sort((left, right) => left - right);
  const selectedScenarios = workspace.data?.scenarios.filter((item) => planSelectionOverrides[item.id] ?? item.comparison_enabled).map((item) => item.id) ?? [];
  const plansWorkspace = useQuery({ queryKey: ["plans-workspace"], queryFn: () => plansRepository.getWorkspace(), enabled: selectedScenarios.length > 0 });
  const model = useMemo(() => {
    if (!workspace.data || !budgets.data) return null;
    if (!selectedScenarios.length) return buildForecastScreenModel(workspace.data, months, [], undefined, budgets.data);
    if (!plansWorkspace.data) return null;
    const evaluation = buildSelectedPlansEvaluation({ ...plansWorkspace.data, forecast: workspace.data, budgets: budgets.data }, selectedScenarios, undefined, months);
    return buildForecastScreenModelFromResult(workspace.data, evaluation.applied.forecast, evaluation.result);
  }, [workspace.data, budgets.data, plansWorkspace.data, months, selectedScenarios]);
  const skippedOccurrences = useMemo(() => workspace.data ? [
    ...workspace.data.items.filter((item) => (item.status === "skipped" || item.status === "canceled") && withinRecoveryWindow(item.updated_at)).map((item) => ({ sourceType: "forecast_item" as const, sourceId: item.id, date: item.expected_date, label: item.label, amountMinor: Number(item.amount_minor), kind: item.kind })),
    ...workspace.data.occurrences.flatMap((item) => {
      if (item.status !== "skipped" || !withinRecoveryWindow(item.updated_at)) return [];
      const rule = workspace.data.rules.find((candidate) => candidate.id === item.recurring_rule_id);
      return rule ? [{ sourceType: "recurring_occurrence" as const, sourceId: rule.id, date: item.occurrence_date, label: rule.label, amountMinor: Number(rule.amount_minor), kind: rule.kind }] : [];
    }),
  ].toSorted((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label)) : [], [workspace.data]);
  const togglePlan = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => plansRepository.updatePlan(id, { comparison_enabled: enabled }),
    onMutate: ({ id, enabled }) => setPlanSelectionOverrides((current) => ({ ...current, [id]: enabled })),
    onError: (_error, { id }) => setPlanSelectionOverrides((current) => { const next = { ...current }; delete next[id]; return next; }),
    onSuccess: async (_data, { id }) => { await Promise.all([
      client.invalidateQueries({ queryKey: ["forecast-workspace"] }), client.invalidateQueries({ queryKey: ["plans-workspace"] }),
      client.invalidateQueries({ queryKey: ["analytics-workspace"] }),
      client.invalidateQueries({ queryKey: ["payday-workspace"] }),
    ]); setPlanSelectionOverrides((current) => { const next = { ...current }; delete next[id]; return next; }); },
  });
  const invalidate = () => Promise.all([
    client.invalidateQueries({ queryKey: ["forecast-workspace"] }),
    client.invalidateQueries({ queryKey: ["analytics-workspace"] }),
    client.invalidateQueries({ queryKey: ["plans-workspace"] }),
    client.invalidateQueries({ queryKey: ["payday-workspace"] }),
    client.invalidateQueries({ queryKey: ["reimbursements-workspace"] }),
  ]);
  useEffect(() => {
    void forecastRepository.purgeExpiredRecoverableItems().then(() => client.invalidateQueries({ queryKey: ["forecast-workspace"] })).catch(() => undefined);
  }, [client]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest("[data-forecast-menu]")) setOpenMenuId(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenuId(null); };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  const save = useMutation({ mutationFn: async () => {
    const amountMinor = Number(parseDisplayAmountToMinor(amount)); if (amountMinor <= 0) throw new Error("Amount must be positive.");
    const payload = { kind, label: label.trim(), amount_minor: amountMinor, expected_date: date, confidence: "expected" as const, scenario_id: scenario || null,
      source_account_id: kind === "income" ? null : source || null, destination_account_id: kind === "expense" ? null : destination || null };
    if (!payload.label || !date) throw new Error("Label and date are required.");
    if (editingId) await forecastRepository.updateItem(editingId, payload); else await forecastRepository.createItem(payload);
  }, onSuccess: () => { setEditingId(null); setLabel(""); setAmount(""); setDate(""); setFormError(""); setDrawerOpen(false); void invalidate(); }, onError: (error) => setFormError(message(error)) });
  const quickSave = useMutation({ mutationFn: async () => {
    const parsed = parseForecastQuickEntry(quickEntry);
    const operatingAccount = workspace.data?.accounts.find((account) => !account.is_system && !account.hidden_from_accounts && account.liquidity_class === "operating")
      ?? workspace.data?.accounts.find((account) => !account.is_system && !account.hidden_from_accounts && account.name.toLowerCase().includes("operating"));
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
  const restoreOccurrence = useMutation({ mutationFn: (command: { sourceType: "forecast_item" | "recurring_occurrence"; sourceId: string; date: string }) => command.sourceType === "forecast_item" ? forecastRepository.updateItem(command.sourceId, { status: "expected" }) : recurringRepository.restoreException(command.sourceId, command.date), onSuccess: () => void invalidate() });
  const settle = useMutation({ mutationFn: async () => {
    if (!settlement) throw new Error("Choose a forecast item first.");
    if (settlement.reimbursementPoolId) {
      const amountMinor = Number(parseDisplayAmountToMinor(repaymentAmount));
      if (amountMinor <= 0 || amountMinor > settlement.expectedAmountMinor) throw new Error("Enter an amount up to the outstanding balance.");
      if (!settlement.destinationAccountId) throw new Error("Choose where the repayment was received.");
      return reimbursementsRepository.recordRepayment({
        poolId: settlement.reimbursementPoolId,
        destinationAccountId: settlement.destinationAccountId,
        amountMinor,
        occurredAt: `${defaultLocalDate()}T12:00:00.000Z`,
        notes: settlement.notes,
        idempotencyKey: crypto.randomUUID(),
      });
    }
    const command = { actualAmountMinor: settlement.expectedAmountMinor, occurredAt: `${settlement.expectedDate}T12:00:00.000Z`,
      sourceAccountId: settlement.kind === "income" ? null : settlement.sourceAccountId,
      destinationAccountId: settlement.kind === "expense" ? null : settlement.destinationAccountId,
      categoryId: settlement.kind === "transfer" ? null : settlement.categoryId,
      notes: settlement.notes, idempotencyKey: crypto.randomUUID() };
    if (settlement.sourceType === "forecast_item") await forecastRepository.settleItem({ ...command, itemId: settlement.sourceId });
    else if (settlement.sourceType === "recurring_occurrence") await recurringRepository.settleOccurrence({ ...command, ruleId: settlement.sourceId, occurrenceDate: settlement.occurrenceDate! });
    else await plansRepository.settleItem({ ...command,
      scenarioChangeId: settlement.sourceType === "plan_change" ? settlement.sourceId : null,
      forecastItemId: settlement.sourceType === "plan_forecast_item" ? settlement.sourceId : null,
    });
  }, onSuccess: () => { setSettlement(null); void Promise.all([
    client.invalidateQueries({ queryKey: ["forecast-workspace"] }), client.invalidateQueries({ queryKey: ["analytics-workspace"] }),
    client.invalidateQueries({ queryKey: ["transactions"] }), client.invalidateQueries({ queryKey: ["accounts"] }),
    client.invalidateQueries({ queryKey: ["budget-workspace"] }),
    client.invalidateQueries({ queryKey: ["plans-workspace"] }), client.invalidateQueries({ queryKey: ["payday-workspace"] }),
    client.invalidateQueries({ queryKey: ["reimbursements-workspace"] }),
  ]); } });
  const adjustReimbursement = useMutation({ mutationFn: async () => {
    const pool = (workspace.data?.reimbursementPools ?? []).find((candidate) => candidate.id === reimbursementEditId);
    if (!pool) throw new Error("Choose a reimbursement tracker first.");
    const totalMinor = Number(parseDisplayAmountToMinor(reimbursementTotal));
    if (totalMinor < 0) throw new Error("The amount owed cannot be negative.");
    return reimbursementsRepository.adjustPool({
      poolId: pool.id, totalMinor, expectedDate: reimbursementDate,
      description: "Matched Splitwise total", idempotencyKey: crypto.randomUUID(),
    });
  }, onSuccess: () => { setReimbursementEditId(null); void invalidate(); } });
  function openCreate() {
    const operatingId = workspace.data?.accounts.find((account) => !account.is_system && !account.hidden_from_accounts && account.liquidity_class === "operating")?.id
      ?? workspace.data?.accounts.find((account) => !account.is_system && !account.hidden_from_accounts && account.name.toLowerCase().includes("operating"))?.id ?? "";
    setEditingId(null); setQuickEntry(""); setShowDetails(false); setFormError(""); setKind("expense"); setLabel(""); setAmount("");
    setDate(defaultLocalDate()); setSource(operatingId); setDestination(operatingId); setScenario(""); setDrawerOpen(true);
  }
  function beginEdit(id: string) { const item = workspace.data?.items.find((candidate) => candidate.id === id); if (!item) return; setEditingId(id); setShowDetails(true); setKind(item.kind); setLabel(item.label); setAmount((Number(item.amount_minor) / 100).toFixed(2)); setDate(item.expected_date); setSource(item.source_account_id ?? ""); setDestination(item.destination_account_id ?? ""); setScenario(item.scenario_id ?? ""); setDrawerOpen(true); }
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  function beginSettlement(item: NonNullable<typeof model>["timeline"][number]) {
    if (item.sourceType === "budget_remaining") return;
    const sourceType = item.sourceType === "scenario_item"
      ? item.sourceId.startsWith("plan:") ? "plan_change" : "plan_forecast_item"
      : item.sourceType;
    const reimbursementPool = (workspace.data?.reimbursementPools ?? []).find((pool) => pool.forecast_item_id === item.sourceId);
    setRepaymentAmount((item.amountMinor / 100).toFixed(2));
    setSettlement({ sourceType, sourceId: item.sourceId.startsWith("plan:") ? item.sourceId.slice(5) : item.sourceId, occurrenceDate: item.recurrenceRuleId ? item.canonicalDate : null,
      label: item.label, kind: item.kind, expectedAmountMinor: item.amountMinor, expectedDate: item.date,
      sourceAccountId: item.sourceAccountId, destinationAccountId: item.destinationAccountId, categoryId: item.categoryId,
      notes: item.notes, planName: workspace.data?.scenarios.find((plan) => plan.id === item.scenarioId)?.name ?? null,
      reimbursementPoolId: reimbursementPool?.id ?? null });
  }
  function beginReimbursementEdit(poolId: string) {
    const pool = (workspace.data?.reimbursementPools ?? []).find((candidate) => candidate.id === poolId);
    if (!pool) return;
    const outstanding = (workspace.data?.reimbursementEntries ?? []).filter((entry) => entry.pool_id === pool.id).reduce((sum, entry) => sum + Number(entry.delta_minor), 0);
    setReimbursementEditId(pool.id); setReimbursementTotal((outstanding / 100).toFixed(2)); setReimbursementDate(pool.expected_date);
  }
  function settlementAction(kind: SettlementDraft["kind"], reimbursement = false) { return reimbursement || kind === "income" ? "Mark received" : kind === "expense" ? "Mark paid" : "Mark transferred"; }
  function settlementState(kind: SettlementDraft["kind"], reimbursement = false) { return reimbursement || kind === "income" ? "received" : kind === "expense" ? "paid" : "transferred"; }
  const currency = workspace.data?.profile.base_currency ?? "NOK";
  return <Page eyebrow="What happens next" title="Forecast" description="Start with the cash you have now, then see how planned income and spending could change it. Planned money never changes your actual account balances.">
    <div className="forecast-toolbar forecast-controls-toolbar" aria-label="Forecast controls"><div><span>Horizon</span><div className="horizon-options">{horizonOptions.map((value) => <button className={months === value ? "active" : ""} key={value} onClick={() => { setHorizon(value); void forecastRepository.saveHorizon(value); }}>{value} months</button>)}</div></div><details className="forecast-plans-control"><summary><span>Plans included</span><small>{selectedScenarios.length}</small></summary><div className="scenario-options">{workspace.data?.scenarios.map((item) => <label key={item.id}><input type="checkbox" checked={selectedScenarios.includes(item.id)} onChange={(event) => togglePlan.mutate({ id: item.id, enabled: event.target.checked })}/>{item.name}</label>)}</div></details>{model ? <small className="forecast-range"><span>Forecast period</span><strong>{dateLabel(model.result.asOfDate)} – {dateLabel(model.result.endDate)}</strong></small> : null}</div>
    {workspace.isLoading || budgets.isLoading || (selectedScenarios.length > 0 && plansWorkspace.isLoading) ? <p className="muted">Building forecast…</p> : null}{workspace.error || budgets.error || plansWorkspace.error ? <p className="field-error" role="alert">{message(workspace.error ?? budgets.error ?? plansWorkspace.error)}</p> : null}
    {model ? <><section className="forecast-mental-model" aria-label="How this forecast is calculated"><div><span>Starting cash</span><strong>{money(model.summary.startingCashMinor, currency)}</strong><small>Actual money now</small></div><span aria-hidden="true">+</span><a href={`/forecast/assumptions?type=income&horizon=${months}`}><span>Planned income</span><strong>{money(model.summary.incomeMinor, currency)}</strong><small>Review what is included</small></a><span aria-hidden="true">−</span><a href={`/forecast/assumptions?type=expense&horizon=${months}`}><span>Planned spending</span><strong>{money(model.summary.expenseMinor, currency)}</strong><small>Review what is included</small></a><span aria-hidden="true">=</span><div><span>Cash in {months} months</span><strong>{money(model.summary.projectedBalanceMinor, currency)}</strong><small>{dateLabel(model.result.endDate)}</small></div></section>
      <section className="forecast-balance-strip" aria-label="Lowest expected cash balance"><div><p>Lowest cash balance</p><small>The least cash you are projected to have</small></div><strong className={model.result.firstFloorBreach ? "negative" : ""}>{money(model.summary.lowestOperatingMinor, currency)}</strong><span>on {dateLabel(model.result.lowestOperatingCash.date)}</span></section>
      {model.result.overdueItems.length ? <section className="money-panel attention-panel"><div className="panel-heading"><div><p className="section-kicker">Needs attention</p><h2>Overdue plans</h2></div><strong>{model.result.overdueItems.length}</strong></div>{model.result.overdueItems.map((item) => <div className="attention-row" key={item.id}><div><strong>{item.label}</strong><span>{dateLabel(item.date)} · {money(item.amountMinor, currency)}</span></div>{item.sourceType === "forecast_item" ? <div className="row-actions"><button onClick={() => update.mutate({ id: item.sourceId, values: { status: "skipped" } })}>Mark skipped</button><button onClick={() => beginEdit(item.sourceId)}>Reschedule</button></div> : null}</div>)}</section> : null}
      <section className="money-panel timeline-panel">
        <div className="panel-heading"><div><p className="section-kicker">What creates your forecast</p><h2>Upcoming timeline</h2><span className="muted">Expected items only. Mark an item paid or received when it happens.</span></div><div className="timeline-heading-actions"><Link className="secondary-button compact-button" to="/forecast/monthly">{workspace.data?.rules.some((rule) => rule.frequency === "monthly" && rule.interval_count === 1 && !rule.scenario_id) ? "Manage monthly forecast" : "Set up monthly forecast"}</Link><button className="primary-button compact-button" type="button" onClick={openCreate}>Add planned item</button></div></div>
        {model.result.scenario.conflicts.length ? <p className="field-error">Conflicting Plan changes were excluded: {model.result.scenario.conflicts.length}.</p> : null}
        <div className="forecast-list timeline-list">{model.timeline.map((item, index) => {
          const planName = workspace.data?.scenarios.find((plan) => plan.id === item.scenarioId)?.name;
          const reimbursementPool = (workspace.data?.reimbursementPools ?? []).find((pool) => pool.forecast_item_id === item.sourceId);
          const reimbursementEntries = reimbursementPool ? (workspace.data?.reimbursementEntries ?? []).filter((entry) => entry.pool_id === reimbursementPool.id) : [];
          const startsMonth = index === 0 || model.timeline[index - 1]!.date.slice(0, 7) !== item.date.slice(0, 7);
          return <Fragment key={item.id}>{startsMonth ? <div className="timeline-month-divider"><span>{monthLabel(item.date)}</span></div> : null}<article className={`forecast-row forecast-row-detailed forecast-row-${reimbursementPool ? "income reimbursement-forecast-row" : item.kind}${item.scenarioId?" plan-timeline-item":""}`}>
          <time dateTime={item.date}>{dateLabel(item.date)}</time>
          <div><strong>{item.label}</strong>{planName?<small className="plan-origin">Plan · {planName}</small>:null}{reimbursementPool ? <details className="reimbursement-breakdown"><summary>What makes up this total</summary><div>{reimbursementEntries.slice(0, 12).map((entry) => <span key={entry.id}><span>{entry.description}</span><strong className={Number(entry.delta_minor) < 0 ? "negative" : ""}>{Number(entry.delta_minor) > 0 ? "+" : "−"}{money(Math.abs(Number(entry.delta_minor)), currency)}</strong></span>)}</div></details> : null}</div>
          <div className="timeline-money"><strong className={item.kind === "expense" ? "negative" : item.kind === "income" || reimbursementPool ? "positive" : ""}>{item.kind === "expense" ? "−" : item.kind === "income" || reimbursementPool ? "+" : "↔"}{money(item.amountMinor, currency)}</strong><small className="after-event-balance">After event: {money(item.runningBalanceMinor, currency)}</small></div>
          {item.sourceType === "forecast_item" ? <div className="timeline-actions">
            <button className="timeline-settle-action" type="button" onClick={() => beginSettlement(item)}>{settlementAction(item.kind, Boolean(reimbursementPool))}</button>
            <div className="timeline-overflow" data-forecast-menu><button className="timeline-overflow-trigger" type="button" aria-label={`More actions for ${item.label}`} aria-expanded={openMenuId === item.id} onClick={() => setOpenMenuId((current) => current === item.id ? null : item.id)}>⋯</button>{openMenuId === item.id ? <div className="timeline-overflow-menu">
              <button onClick={() => { setOpenMenuId(null); reimbursementPool ? beginReimbursementEdit(reimbursementPool.id) : beginEdit(item.sourceId); }}>Edit</button>
              {!reimbursementPool ? <><button onClick={() => { setOpenMenuId(null); update.mutate({ id: item.sourceId, values: { status: "skipped" } }); }}>Skip</button><button className="delete-action" onClick={() => { setOpenMenuId(null); update.mutate({ id: item.sourceId, values: { status: "canceled" } }); }}>Delete</button></> : null}
            </div> : null}</div>
          </div> : item.recurrenceRuleId ? <div className="timeline-actions">
            <button className="timeline-settle-action" type="button" onClick={() => beginSettlement(item)}>{settlementAction(item.kind)}</button>
            <div className="timeline-overflow" data-forecast-menu><button className="timeline-overflow-trigger" type="button" aria-label={`More actions for ${item.label}`} aria-expanded={openMenuId === item.id} onClick={() => setOpenMenuId((current) => current === item.id ? null : item.id)}>⋯</button>{openMenuId === item.id ? <div className="timeline-overflow-menu">
              <button onClick={() => { setOpenMenuId(null); occurrence.mutate({ ruleId: item.recurrenceRuleId!, date: item.canonicalDate }); }}>Skip this occurrence</button>
            </div> : null}</div>
          </div> : item.sourceType === "scenario_item" ? <div className="timeline-actions">
            <button className="timeline-settle-action" type="button" onClick={() => beginSettlement(item)}>{settlementAction(item.kind)}</button>
          </div> : null}
        </article></Fragment>})}</div>
      </section>
      {skippedOccurrences.length ? <details className="skipped-occurrences-panel"><summary><span>Skipped and deleted occurrences</span><small>{skippedOccurrences.length}</small></summary><div className="skipped-occurrences-list"><p className="muted">Available to restore for 30 days.</p>{skippedOccurrences.map((item) => <div className="skipped-occurrence-row" key={`${item.sourceType}:${item.sourceId}:${item.date}`}><div><strong>{item.label}</strong><span>{dateLabel(item.date)} · {item.kind === "expense" ? "−" : item.kind === "income" ? "+" : "↔"}{money(item.amountMinor, currency)}</span></div><button type="button" disabled={restoreOccurrence.isPending} onClick={() => restoreOccurrence.mutate({ sourceType: item.sourceType, sourceId: item.sourceId, date: item.date })}>Restore</button></div>)}{restoreOccurrence.error ? <p className="field-error" role="alert">This occurrence could not be restored.</p> : null}</div></details> : null}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} eyebrow="One-off plan" title={editingId ? "Edit planned item" : "Add planned item"}>
        {!editingId && !showDetails ? <form className="money-form quick-plan-form" onSubmit={(event) => { event.preventDefault(); quickSave.mutate(); }}>
          <label>Describe the planned item<input autoFocus value={quickEntry} onChange={(event) => setQuickEntry(event.target.value)} placeholder="Phone bill 568 15 September" required/></label>
          <p className="form-help">Order does not matter. Use <strong>+</strong> for income; otherwise it is an expense. For example: “15 Sep Salary +23000”. Operating Cash is automatic.</p>
          {formError ? <p className="field-error" role="alert">{formError}</p> : null}
          <button className="primary-button" disabled={quickSave.isPending}>{quickSave.isPending ? "Adding…" : "Add to forecast"}</button>
          <button className="secondary-button" type="button" onClick={() => { setShowDetails(true); setFormError(""); }}>More options</button>
        </form> : <form className="money-form" onSubmit={submit}><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label><label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} required/></label><label>Amount<input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} required/></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></label>{kind !== "income" ? <label>From account<select value={source} onChange={(event) => setSource(event.target.value)} required><option value="">Choose account</option>{workspace.data?.accounts.filter((account) => !account.is_system && !account.hidden_from_accounts).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}{kind !== "expense" ? <label>To account<select value={destination} onChange={(event) => setDestination(event.target.value)} required><option value="">Choose account</option>{workspace.data?.accounts.filter((account) => !account.is_system && !account.hidden_from_accounts).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}<label>Plan <span className="optional">optional</span><select value={scenario} onChange={(event) => setScenario(event.target.value)}><option value="">Base forecast</option>{workspace.data?.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{formError ? <p className="field-error" role="alert">{formError}</p> : null}<button className="primary-button" disabled={save.isPending}>{editingId ? "Save changes" : "Add to forecast"}</button>{!editingId ? <button className="secondary-button" type="button" onClick={() => { setShowDetails(false); setFormError(""); }}>Use quick entry</button> : null}</form>}
      </Drawer>
      <Drawer open={Boolean(reimbursementEditId)} onClose={() => setReimbursementEditId(null)} eyebrow="Money owed to you" title="Edit Splitwise balance">
        <form className="money-form" onSubmit={(event) => { event.preventDefault(); adjustReimbursement.mutate(); }}>
          <label>Total currently owed<input value={reimbursementTotal} onChange={(event) => setReimbursementTotal(event.target.value)} inputMode="decimal" required/></label>
          <label>Expected repayment date<input type="date" value={reimbursementDate} onChange={(event) => setReimbursementDate(event.target.value)} required/></label>
          <p className="form-help">Changing the total creates a traceable correction. It does not rewrite purchases or repayments.</p>
          {adjustReimbursement.error ? <p className="field-error" role="alert">{userFacingError(adjustReimbursement.error, "The Splitwise balance could not be updated.")}</p> : null}
          <button className="primary-button" disabled={adjustReimbursement.isPending}>{adjustReimbursement.isPending ? "Saving…" : "Save balance"}</button>
        </form>
      </Drawer>
      <ConfirmationDialog open={Boolean(settlement)} onClose={() => setSettlement(null)} eyebrow="Confirm actual money" title={settlement ? `Mark this item as ${settlementState(settlement.kind, Boolean(settlement.reimbursementPoolId))}?` : "Confirm item"}>
        {settlement ? <form className="settlement-confirmation" onSubmit={(event) => { event.preventDefault(); settle.mutate(); }}>
          <div className="settlement-confirmation-summary">
            <div><strong>{settlement.label}</strong><small>{dateLabel(settlement.expectedDate)}{settlement.planName ? ` · Plan: ${settlement.planName}` : ""}</small></div>
            <strong className={settlement.kind === "expense" ? "negative" : settlement.kind === "income" || settlement.reimbursementPoolId ? "positive" : ""}>{settlement.kind === "expense" ? "−" : settlement.kind === "income" || settlement.reimbursementPoolId ? "+" : "↔"}{money(settlement.expectedAmountMinor, currency)}</strong>
          </div>
          {settlement.reimbursementPoolId ? <><label className="settlement-amount-field">Amount received<input aria-label="Reimbursement amount received" value={repaymentAmount} onChange={(event) => setRepaymentAmount(event.target.value)} inputMode="decimal" required/></label><p className="muted">A partial repayment reduces the Splitwise balance and keeps the remainder in your forecast. This is a transfer from money owed to cash, not income.</p></> : <p className="muted">This records it in Activity and removes it from your forecast{settlement.planName ? " and Plan" : ""}.</p>}
          {settle.error ? <p className="field-error" role="alert">{userFacingError(settle.error, "This payment could not be recorded.")}</p> : null}
          <div className="confirmation-actions">
            <button className="secondary-button" type="button" onClick={() => setSettlement(null)} disabled={settle.isPending}>Cancel</button>
            <button className="primary-button" disabled={settle.isPending}>{settle.isPending ? "Recording…" : settlementAction(settlement.kind, Boolean(settlement.reimbursementPoolId))}</button>
          </div>
        </form> : null}
      </ConfirmationDialog>
    </> : null}
  </Page>;
}
