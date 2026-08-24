import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { recurringRepository, type MonthlyBaselineRule } from "~/data/repositories/recurring-repository";
import { addMonthsClamped } from "~/domain/forecast";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { userFacingError } from "~/user-facing-error";

type Workspace = Awaited<ReturnType<typeof forecastRepository.getWorkspace>>;
type BaselineKind = "income" | "expense";
type BaselineRow = {
  clientId: string;
  id?: string;
  kind: BaselineKind;
  label: string;
  amount: string;
  day: number;
  categoryId: string | null;
  notes: string | null;
  isReliableIncome: boolean;
};

const pastedLine = /^([+-])\s+(.+?)\s+([0-9]+(?:[.,][0-9]{1,2})?)\s+(?:on\s+)?([0-9]{1,2})(?:st|nd|rd|th)?$/i;

function localMonth(): string {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 7);
}

function addMonths(value: string, count: number): string {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + count);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function endOfMonth(value: string): string {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  return `${value}-${String(date.getDate()).padStart(2, "0")}`;
}

export function forecastHorizonThroughMonth(endMonth: string, today: string): number {
  const current = new Date(`${today}T12:00:00Z`);
  const target = endOfMonth(endMonth);
  let months = (Number(endMonth.slice(0, 4)) - current.getUTCFullYear()) * 12
    + Number(endMonth.slice(5, 7)) - (current.getUTCMonth() + 1);
  if (addMonthsClamped(today, months) < target) months += 1;
  return Math.max(1, months);
}

function inclusiveMonths(first: string, last: string): number {
  const start = new Date(`${first}-01T12:00:00`);
  const end = new Date(`${last}-01T12:00:00`);
  return Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
}

function newRow(kind: BaselineKind): BaselineRow {
  return { clientId: crypto.randomUUID(), kind, label: "", amount: "", day: 1, categoryId: null, notes: null, isReliableIncome: false };
}

function initialState(workspace: Workspace) {
  const rules = workspace.rules.filter((rule) => rule.frequency === "monthly" && rule.interval_count === 1 && !rule.scenario_id && (rule.kind === "income" || rule.kind === "expense"));
  const rows: BaselineRow[] = rules.map((rule) => ({
    clientId: rule.id, id: rule.id, kind: rule.kind as BaselineKind, label: rule.label,
    amount: (Number(rule.amount_minor) / 100).toFixed(2), day: rule.day_of_month ?? 1,
    categoryId: rule.category_id, notes: rule.notes, isReliableIncome: rule.is_reliable_income,
  }));
  const starts = rules.map((rule) => rule.start_on.slice(0, 7)).sort();
  const ends = rules.flatMap((rule) => rule.end_on ? [rule.end_on.slice(0, 7)] : []).sort();
  const startMonth = starts[0] ?? localMonth();
  const endMonth = ends.at(-1) ?? addMonths(startMonth, 12);
  return { rows: rows.length ? rows : [newRow("income"), newRow("expense")], originalIds: rules.map((rule) => rule.id), startMonth, endMonth };
}

function rowMinor(row: BaselineRow): number {
  if (!row.amount.trim()) return 0;
  try { return Number(parseDisplayAmountToMinor(row.amount)); } catch { return 0; }
}

function BaselineTable({ kind, rows, onChange, onAdd, onRemove }: {
  kind: BaselineKind;
  rows: BaselineRow[];
  onChange: (clientId: string, change: Partial<BaselineRow>) => void;
  onAdd: () => void;
  onRemove: (clientId: string) => void;
}) {
  const title = kind === "income" ? "Monthly income" : "Monthly expenses";
  return <section className="money-panel baseline-section">
    <div className="panel-heading"><div><p className="section-kicker">{kind === "income" ? "Money in" : "Money out"}</p><h2>{title}</h2></div><button className="secondary-button compact-button" type="button" onClick={onAdd}>Add {kind}</button></div>
    <div className="baseline-table" role="group" aria-label={title}>
      <div className="baseline-table-head" aria-hidden="true"><span>Name</span><span>Amount</span><span>Usual day</span><span/></div>
      {rows.map((row, index) => <div className="baseline-row" key={row.clientId}>
        <label><span>Name</span><input aria-label={`${kind === "income" ? "Income" : "Expense"} name ${index + 1}`} value={row.label} onChange={(event) => onChange(row.clientId, { label: event.target.value })} placeholder={kind === "income" ? "Salary" : "Rent"}/></label>
        <label><span>Amount</span><input aria-label={`${kind === "income" ? "Income" : "Expense"} amount ${index + 1}`} inputMode="decimal" value={row.amount} onChange={(event) => onChange(row.clientId, { amount: event.target.value })} placeholder="0.00"/></label>
        <label><span>Usual day</span><input aria-label={`${kind === "income" ? "Income" : "Expense"} day ${index + 1}`} type="number" min="1" max="31" value={row.day} onChange={(event) => onChange(row.clientId, { day: Number(event.target.value) })}/></label>
        <button className="baseline-remove" type="button" aria-label={`Remove ${row.label || `${kind} row ${index + 1}`}`} onClick={() => onRemove(row.clientId)}>Remove</button>
      </div>)}
    </div>
  </section>;
}

export default function MonthlyForecastRoute() {
  const workspace = useQuery({ queryKey: ["forecast-workspace"], queryFn: () => forecastRepository.getWorkspace() });
  return <Page eyebrow="Forecast setup" title="Monthly forecast" description="Enter your usual monthly income and expenses once. Runway will repeat them across the period you choose.">
    {workspace.isLoading ? <p className="muted">Loading your monthly forecast…</p> : null}
    {workspace.error ? <p className="field-error" role="alert">{userFacingError(workspace.error, "Your monthly forecast could not be loaded.")}</p> : null}
    {workspace.data ? <MonthlyForecastEditor key={workspace.data.rules.map((rule) => rule.updated_at).join(":")} workspace={workspace.data}/> : null}
  </Page>;
}

function MonthlyForecastEditor({ workspace }: { workspace: Workspace }) {
  const initial = useMemo(() => initialState(workspace), [workspace]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [rows, setRows] = useState(initial.rows);
  const [startMonth, setStartMonth] = useState(initial.startMonth);
  const [endMonth, setEndMonth] = useState(initial.endMonth);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState("");

  const populated = rows.filter((row) => row.label.trim() || row.amount.trim());
  const incomeMinor = populated.filter((row) => row.kind === "income").reduce((sum, row) => sum + rowMinor(row), 0);
  const expenseMinor = populated.filter((row) => row.kind === "expense").reduce((sum, row) => sum + rowMinor(row), 0);
  const currency = workspace.profile.base_currency;
  const operatingAccount = workspace.accounts.find((account) => !account.is_system && account.liquidity_class === "operating")
    ?? workspace.accounts.find((account) => !account.is_system && account.name.toLowerCase().includes("operating"));

  const updateRow = (clientId: string, change: Partial<BaselineRow>) => setRows((current) => current.map((row) => row.clientId === clientId ? { ...row, ...change } : row));
  const removeRow = (clientId: string) => setRows((current) => current.filter((row) => row.clientId !== clientId));
  const addRow = (kind: BaselineKind) => setRows((current) => [...current, newRow(kind)]);

  const save = useMutation({ mutationFn: async () => {
    if (!operatingAccount) throw new Error("Operating Cash is not available.");
    if (!startMonth || !endMonth || endMonth < startMonth) throw new Error("Choose a valid forecast period.");
    if (!populated.length) throw new Error("Add at least one monthly income or expense.");
    const rules: MonthlyBaselineRule[] = populated.map((row) => {
      const amountMinor = rowMinor(row);
      if (!row.label.trim() || amountMinor <= 0 || row.day < 1 || row.day > 31) throw new Error("Every row needs a name, positive amount, and day from 1 to 31.");
      return { ...(row.id ? { id: row.id } : {}), kind: row.kind, label: row.label.trim(), amount_minor: amountMinor, day_of_month: row.day,
        start_on: `${startMonth}-01`, end_on: endOfMonth(endMonth),
        source_account_id: row.kind === "expense" ? operatingAccount.id : null,
        destination_account_id: row.kind === "income" ? operatingAccount.id : null,
        category_id: row.categoryId, notes: row.notes, is_reliable_income: row.kind === "income" && row.isReliableIncome };
    });
    const retainedIds = new Set(rules.flatMap((rule) => rule.id ? [rule.id] : []));
    await recurringRepository.saveMonthlyBaseline(rules, initial.originalIds.filter((id) => !retainedIds.has(id)));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: workspace.profile.timezone, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date());
    const requiredHorizon = forecastHorizonThroughMonth(endMonth, today);
    if (Number(workspace.profile.forecast_horizon_months ?? 12) < requiredHorizon) await forecastRepository.saveHorizon(requiredHorizon);
  }, onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["forecast-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["plans-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["payday-workspace"] }),
    ]);
    navigate("/forecast");
  }});

  function importPaste() {
    try {
      const imported = pasted.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
        const match = line.trim().match(pastedLine);
        if (!match) throw new Error(`Could not understand: “${line.trim()}”`);
        const amountMinor = Number(parseDisplayAmountToMinor(match[3]!));
        const day = Number(match[4]);
        if (amountMinor <= 0 || day < 1 || day > 31) throw new Error(`Check the amount or day in: “${line.trim()}”`);
        return { ...newRow(match[1] === "+" ? "income" : "expense"), label: match[2]!.trim(), amount: (amountMinor / 100).toFixed(2), day };
      });
      if (!imported.length) throw new Error("Paste at least one line.");
      setRows((current) => [...current.filter((row) => row.label.trim() || row.amount.trim()), ...imported]);
      setPasted(""); setPasteError(""); setPasteOpen(false);
    } catch (error) { setPasteError(error instanceof Error ? error.message : "The list could not be imported."); }
  }

  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  return <form className="monthly-baseline" onSubmit={submit}>
    <div className="baseline-nav"><Link to="/forecast">← Back to Forecast</Link><button className="secondary-button compact-button" type="button" onClick={() => setPasteOpen((open) => !open)}>Paste a list</button></div>
    {pasteOpen ? <section className="money-panel paste-baseline"><div><p className="section-kicker">Fast entry</p><h2>Paste monthly items</h2><p className="muted">Use one line per item, for example: <strong>+ Salary 40000 on 20</strong> or <strong>− Rent 12000 on 1</strong>.</p></div><textarea aria-label="Monthly items to import" value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={"+ Salary 40000 on 20\n- Rent 12000 on 1\n- Phone bill 568 on 15"}/>{pasteError ? <p className="field-error" role="alert">{pasteError}</p> : null}<div className="button-row"><button className="primary-button" type="button" onClick={importPaste}>Add these items</button><button className="secondary-button" type="button" onClick={() => { setPasteOpen(false); setPasteError(""); }}>Cancel</button></div></section> : null}
    <section className="money-panel baseline-period"><div><p className="section-kicker">Forecast period</p><h2>Choose the months</h2><p className="muted">This shared range applies to every item below.</p></div><label>Starts<input aria-label="Monthly forecast starts" type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)}/></label><span aria-hidden="true">→</span><label>Ends<input aria-label="Monthly forecast ends" type="month" min={startMonth} value={endMonth} onChange={(event) => setEndMonth(event.target.value)}/></label></section>
    <BaselineTable kind="income" rows={rows.filter((row) => row.kind === "income")} onChange={updateRow} onAdd={() => addRow("income")} onRemove={removeRow}/>
    <BaselineTable kind="expense" rows={rows.filter((row) => row.kind === "expense")} onChange={updateRow} onAdd={() => addRow("expense")} onRemove={removeRow}/>
    <section className="money-panel baseline-summary"><div><p className="section-kicker">Monthly picture</p><h2>{formatMinorUnits(asMinorUnits(incomeMinor - expenseMinor), currency)} net each month</h2><p className="muted">{inclusiveMonths(startMonth, endMonth)} months · {populated.filter((row) => row.kind === "income").length} income item{populated.filter((row) => row.kind === "income").length === 1 ? "" : "s"} · {populated.filter((row) => row.kind === "expense").length} expense item{populated.filter((row) => row.kind === "expense").length === 1 ? "" : "s"}</p></div><dl><div><dt>Income</dt><dd className="positive">+{formatMinorUnits(asMinorUnits(incomeMinor), currency)}</dd></div><div><dt>Expenses</dt><dd className="negative">−{formatMinorUnits(asMinorUnits(expenseMinor), currency)}</dd></div></dl><div><button className="primary-button" disabled={save.isPending}>{save.isPending ? "Applying…" : "Apply to forecast"}</button><p className="muted">Saves these items and makes the full period visible in Forecast.</p></div></section>
    {save.error ? <p className="field-error" role="alert">{userFacingError(save.error, "Your monthly forecast could not be saved.")}</p> : null}
  </form>;
}
