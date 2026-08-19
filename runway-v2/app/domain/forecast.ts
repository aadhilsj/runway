export type CalendarDate = string;
export type PlannedKind = "income" | "expense" | "transfer";
export type PlannedConfidence = "committed" | "expected" | "tentative";

export interface ForecastAccountInput {
  id: string; name: string; class: "asset" | "liability";
  subtype: "checking" | "savings" | "cash" | "investment" | "credit_card" | "loan";
  liquidityClass: "operating" | "liquid" | "invested" | "liability" | "non_liquid";
  balanceMinor: number; includeInNetWorth: boolean;
}
export interface OneOffForecastInput {
  id: string; kind: PlannedKind; date: CalendarDate; amountMinor: number;
  sourceAccountId?: string | null; destinationAccountId?: string | null; categoryId?: string | null;
  label: string; notes?: string | null; confidence?: PlannedConfidence; scenarioId?: string | null;
  sortOrder?: number | null; status: "expected" | "skipped" | "canceled" | "matched" | "realized";
}
export interface RecurringRuleInput {
  id: string; kind: PlannedKind; label: string; notes?: string | null;
  sourceAccountId?: string | null; destinationAccountId?: string | null; categoryId?: string | null;
  amountMinor: number; frequency: "weekly" | "monthly" | "yearly"; intervalCount: number;
  dayOfMonth?: number | null; dayOfWeek?: number | null; startOn: CalendarDate; endOn?: CalendarDate | null;
  defaultSortOrder?: number | null; confidence?: PlannedConfidence; scenarioId?: string | null; active: boolean;
}
export interface RecurrenceExceptionInput {
  id: string; recurringRuleId: string; occurrenceDate: CalendarDate;
  status: "expected" | "skipped" | "overridden" | "matched";
  overrideDate?: CalendarDate | null; overrideAmountMinor?: number | null; matchedTransactionId?: string | null;
  expectedAmountMinorSnapshot?: number | null; expectedDateSnapshot?: CalendarDate | null;
}
export interface ScenarioOverlayInput {
  scenarioId: string;
  modifications?: Array<{ baseSourceId: string; date?: CalendarDate; amountMinor?: number; label?: string }>;
}
export interface ForecastPolicy { includedConfidences: PlannedConfidence[]; futurePostedTransactions: "exclude" }
export interface ForecastFundInput { id: string; name: string; balanceMinor: number }
export interface ProjectedFundActionInput { id: string; date: CalendarDate; fundId: string; amountMinor: number; label: string }
export interface ForecastInput {
  asOfDate: CalendarDate; endDate: CalendarDate; timezone: string; baseCurrency: string; operatingFloorMinor: number;
  accounts: readonly ForecastAccountInput[]; forecastItems: readonly OneOffForecastInput[];
  recurringRules: readonly RecurringRuleInput[]; recurrenceExceptions: readonly RecurrenceExceptionInput[];
  selectedScenarioIds: readonly string[]; scenarioOverlays?: readonly ScenarioOverlayInput[]; policy?: ForecastPolicy;
  funds?: readonly ForecastFundInput[]; projectedFundActions?: readonly ProjectedFundActionInput[];
}
export interface ProjectedEvent {
  id: string; logicalId: string; sourceType: "forecast_item" | "recurring_occurrence" | "scenario_item";
  sourceId: string; kind: PlannedKind; date: CalendarDate; canonicalDate: CalendarDate; amountMinor: number;
  sourceAccountId: string | null; destinationAccountId: string | null; categoryId: string | null;
  label: string; notes: string | null; confidence: PlannedConfidence; scenarioId: string | null;
  sortOrder: number | null; recurrenceRuleId: string | null;
}
export interface ProjectedTraceRow extends ProjectedEvent {
  accountBalances: Record<string, number>; operatingCashMinor: number; liquidCashMinor: number;
  totalAssetsMinor: number; liabilitiesMinor: number; netWorthMinor: number;
}
export interface ForecastPoint {
  date: CalendarDate; operatingCashMinor: number; liquidCashMinor: number;
  totalAssetsMinor: number; liabilitiesMinor: number; netWorthMinor: number;
}
export interface MonthlyForecastAggregate extends ForecastPoint {
  month: string; incomeMinor: number; expenseMinor: number; transfersInMinor: number;
  transfersOutMinor: number; netExternalCashFlowMinor: number;
}
export interface ForecastResult {
  asOfDate: CalendarDate; endDate: CalendarDate; events: ProjectedTraceRow[]; overdueItems: ProjectedEvent[];
  dailySeries: ForecastPoint[]; monthly: MonthlyForecastAggregate[]; endingAccountBalances: Record<string, number>;
  endingOperatingCashMinor: number; endingLiquidCashMinor: number; endingNetWorthMinor: number;
  lowestOperatingCash: { date: CalendarDate; balanceMinor: number };
  lowestLiquidCash: { date: CalendarDate; balanceMinor: number };
  floorBreaches: Array<{ date: CalendarDate; balanceMinor: number; amountBelowFloorMinor: number; eventId: string | null }>;
  firstFloorBreach: ForecastResult["floorBreaches"][number] | null;
  totals: { incomeMinor: number; expenseMinor: number; transferMinor: number };
  scenario: { selectedIds: string[]; eventCount: number; conflicts: Array<{ sourceId: string; scenarioIds: string[] }> };
  fundSeries: Array<{ date: CalendarDate; balancesMinor: Record<string, number> }>;
  projectedFundActions: Array<ProjectedFundActionInput & { resultingBalanceMinor: number }>;
  projectedFundGoalDates: Record<string, CalendarDate | null>;
}

const DAY_MS = 86_400_000;
function assertDate(value: string): void { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Invalid calendar date: ${value}`); }
function utcDate(value: CalendarDate): Date { assertDate(value); return new Date(`${value}T00:00:00Z`); }
function dateOnly(value: Date): CalendarDate { return value.toISOString().slice(0, 10); }
function addDays(value: CalendarDate, days: number): CalendarDate { const date = utcDate(value); date.setUTCDate(date.getUTCDate() + days); return dateOnly(date); }
function monthIndex(value: CalendarDate): number { const date = utcDate(value); return date.getUTCFullYear() * 12 + date.getUTCMonth(); }
function daysInMonth(year: number, monthZero: number): number { return new Date(Date.UTC(year, monthZero + 1, 0)).getUTCDate(); }
function clampedMonthDate(year: number, monthZero: number, day: number): CalendarDate { return dateOnly(new Date(Date.UTC(year, monthZero, Math.min(day, daysInMonth(year, monthZero))))); }

export function expandRecurringRule(rule: RecurringRuleInput, exceptions: readonly RecurrenceExceptionInput[], startDate: CalendarDate, endDate: CalendarDate): ProjectedEvent[] {
  assertDate(startDate); assertDate(endDate); assertDate(rule.startOn);
  if (endDate < startDate || !rule.active || rule.intervalCount < 1 || rule.amountMinor <= 0) return [];
  const exceptionMap = new Map(exceptions.filter((item) => item.recurringRuleId === rule.id).map((item) => [item.occurrenceDate, item]));
  const canonicalDates: CalendarDate[] = [];
  const effectiveEnd = rule.endOn && rule.endOn < endDate ? rule.endOn : endDate;
  if (effectiveEnd < rule.startOn) return [];
  if (rule.frequency === "weekly") {
    let current = rule.startOn;
    if (rule.dayOfWeek != null) current = addDays(current, (rule.dayOfWeek - utcDate(current).getUTCDay() + 7) % 7);
    for (; current <= effectiveEnd; current = addDays(current, 7 * rule.intervalCount)) canonicalDates.push(current);
  } else if (rule.frequency === "monthly") {
    const start = utcDate(rule.startOn); const preferredDay = rule.dayOfMonth ?? start.getUTCDate();
    for (let index = monthIndex(rule.startOn); ; index += rule.intervalCount) {
      const candidate = clampedMonthDate(Math.floor(index / 12), index % 12, preferredDay);
      if (candidate > effectiveEnd) break; if (candidate >= rule.startOn) canonicalDates.push(candidate);
    }
  } else {
    const start = utcDate(rule.startOn); const month = start.getUTCMonth(); const day = rule.dayOfMonth ?? start.getUTCDate();
    for (let year = start.getUTCFullYear(); ; year += rule.intervalCount) {
      const candidate = clampedMonthDate(year, month, day);
      if (candidate > effectiveEnd) break; if (candidate >= rule.startOn) canonicalDates.push(candidate);
    }
  }
  return canonicalDates.flatMap((canonicalDate) => {
    const exception = exceptionMap.get(canonicalDate);
    if (exception?.status === "skipped" || exception?.status === "matched") return [];
    const date = exception?.overrideDate ?? canonicalDate;
    if (date < startDate || date > endDate) return [];
    return [{ id: `recurrence:${rule.id}:${canonicalDate}`, logicalId: `${rule.id}:${canonicalDate}`,
      sourceType: "recurring_occurrence" as const, sourceId: rule.id, kind: rule.kind, date, canonicalDate,
      amountMinor: exception?.overrideAmountMinor ?? rule.amountMinor, sourceAccountId: rule.sourceAccountId ?? null,
      destinationAccountId: rule.destinationAccountId ?? null, categoryId: rule.categoryId ?? null,
      label: rule.label, notes: rule.notes ?? null, confidence: rule.confidence ?? "expected",
      scenarioId: rule.scenarioId ?? null, sortOrder: rule.defaultSortOrder ?? null, recurrenceRuleId: rule.id }];
  });
}

function eventOrder(event: ProjectedEvent): number { return event.sortOrder ?? (event.kind === "expense" ? 20 : event.kind === "income" ? 30 : 40); }
export function compareProjectedEvents(a: ProjectedEvent, b: ProjectedEvent): number { return a.date.localeCompare(b.date) || eventOrder(a) - eventOrder(b) || a.logicalId.localeCompare(b.logicalId); }
function accountTotals(accounts: readonly ForecastAccountInput[], balances: Record<string, number>) {
  let operatingCashMinor = 0, liquidCashMinor = 0, totalAssetsMinor = 0, liabilitiesMinor = 0, netWorthMinor = 0;
  for (const account of accounts) { const balance = balances[account.id] ?? 0;
    if (account.class === "asset") { totalAssetsMinor += balance; if (account.liquidityClass === "operating") operatingCashMinor += balance;
      if (["operating", "liquid"].includes(account.liquidityClass)) liquidCashMinor += balance; if (account.includeInNetWorth) netWorthMinor += balance;
    } else { liabilitiesMinor += balance; if (account.includeInNetWorth) netWorthMinor -= balance; } }
  return { operatingCashMinor, liquidCashMinor, totalAssetsMinor, liabilitiesMinor, netWorthMinor };
}
function toOneOff(item: OneOffForecastInput): ProjectedEvent { return { id: `forecast:${item.id}`, logicalId: item.id,
  sourceType: item.scenarioId ? "scenario_item" : "forecast_item", sourceId: item.id, kind: item.kind, date: item.date,
  canonicalDate: item.date, amountMinor: item.amountMinor, sourceAccountId: item.sourceAccountId ?? null,
  destinationAccountId: item.destinationAccountId ?? null, categoryId: item.categoryId ?? null, label: item.label,
  notes: item.notes ?? null, confidence: item.confidence ?? "expected", scenarioId: item.scenarioId ?? null,
  sortOrder: item.sortOrder ?? null, recurrenceRuleId: null }; }

export function forecast(input: ForecastInput): ForecastResult {
  assertDate(input.asOfDate); assertDate(input.endDate); if (input.endDate < input.asOfDate) throw new Error("Forecast end date must be on or after as-of date");
  const policy = input.policy ?? { includedConfidences: ["committed", "expected", "tentative"], futurePostedTransactions: "exclude" };
  const selected = new Set(input.selectedScenarioIds);
  let all = [...input.forecastItems.filter((item) => item.status === "expected" && (!item.scenarioId || selected.has(item.scenarioId))).map(toOneOff),
    ...input.recurringRules.filter((rule) => !rule.scenarioId || selected.has(rule.scenarioId)).flatMap((rule) => expandRecurringRule(rule, input.recurrenceExceptions, input.asOfDate, input.endDate))]
    .filter((event) => policy.includedConfidences.includes(event.confidence));
  const overlayTargets = new Map<string, string[]>();
  for (const overlay of input.scenarioOverlays ?? []) if (selected.has(overlay.scenarioId)) for (const modification of overlay.modifications ?? []) {
    const ids = overlayTargets.get(modification.baseSourceId) ?? []; ids.push(overlay.scenarioId); overlayTargets.set(modification.baseSourceId, ids);
    all = all.map((event) => event.sourceId === modification.baseSourceId ? { ...event, date: modification.date ?? event.date,
      amountMinor: modification.amountMinor ?? event.amountMinor, label: modification.label ?? event.label } : event);
  }
  const conflicts = [...overlayTargets].filter(([, ids]) => new Set(ids).size > 1).map(([sourceId, ids]) => ({ sourceId, scenarioIds: [...new Set(ids)].sort() }));
  if (conflicts.length) { const conflicted = new Set(conflicts.map((item) => item.sourceId)); all = all.filter((event) => !conflicted.has(event.sourceId)); }
  const overdueItems = all.filter((event) => event.date < input.asOfDate).toSorted(compareProjectedEvents);
  const events = all.filter((event) => event.date >= input.asOfDate && event.date <= input.endDate).toSorted(compareProjectedEvents);
  const accountById = new Map(input.accounts.map((account) => [account.id, account]));
  const balances: Record<string, number> = Object.fromEntries(input.accounts.map((account) => [account.id, account.balanceMinor]));
  const baseline = accountTotals(input.accounts, balances); const trace: ProjectedTraceRow[] = [];
  const floorBreaches: ForecastResult["floorBreaches"] = []; const totals = { incomeMinor: 0, expenseMinor: 0, transferMinor: 0 };
  for (const event of events) {
    if (event.kind === "income") { if (!event.destinationAccountId || !accountById.has(event.destinationAccountId)) throw new Error(`Income ${event.id} requires a destination account`);
      balances[event.destinationAccountId] = (balances[event.destinationAccountId] ?? 0) + event.amountMinor; totals.incomeMinor += event.amountMinor;
    } else if (event.kind === "expense") { if (!event.sourceAccountId || !accountById.has(event.sourceAccountId)) throw new Error(`Expense ${event.id} requires a source account`);
      balances[event.sourceAccountId] = (balances[event.sourceAccountId] ?? 0) - event.amountMinor; totals.expenseMinor += event.amountMinor;
    } else { const source = event.sourceAccountId ? accountById.get(event.sourceAccountId) : null; const destination = event.destinationAccountId ? accountById.get(event.destinationAccountId) : null;
      if (!source || !destination || source.id === destination.id) throw new Error(`Transfer ${event.id} requires distinct owned accounts`);
      balances[source.id] = (balances[source.id] ?? 0) + (source.class === "liability" ? event.amountMinor : -event.amountMinor);
      balances[destination.id] = (balances[destination.id] ?? 0) + (destination.class === "liability" ? -event.amountMinor : event.amountMinor); totals.transferMinor += event.amountMinor; }
    const aggregate = accountTotals(input.accounts, balances); trace.push({ ...event, accountBalances: { ...balances }, ...aggregate });
    if (aggregate.operatingCashMinor < input.operatingFloorMinor) floorBreaches.push({ date: event.date, balanceMinor: aggregate.operatingCashMinor,
      amountBelowFloorMinor: input.operatingFloorMinor - aggregate.operatingCashMinor, eventId: event.id });
  }
  const dailySeries: ForecastPoint[] = []; let traceIndex = 0; let current = baseline;
  for (let date = input.asOfDate; date <= input.endDate; date = addDays(date, 1)) { while (traceIndex < trace.length && trace[traceIndex]!.date === date) current = trace[traceIndex++]!;
    dailySeries.push({ date, operatingCashMinor: current.operatingCashMinor, liquidCashMinor: current.liquidCashMinor,
      totalAssetsMinor: current.totalAssetsMinor, liabilitiesMinor: current.liabilitiesMinor, netWorthMinor: current.netWorthMinor }); }
  const byMonth = new Map<string, MonthlyForecastAggregate>();
  for (const point of dailySeries) { const month = point.date.slice(0, 7); const existing = byMonth.get(month) ?? { month, incomeMinor: 0, expenseMinor: 0,
      transfersInMinor: 0, transfersOutMinor: 0, netExternalCashFlowMinor: 0, ...point }; Object.assign(existing, point); byMonth.set(month, existing); }
  for (const event of trace) { const row = byMonth.get(event.date.slice(0, 7))!; if (event.kind === "income") row.incomeMinor += event.amountMinor;
    else if (event.kind === "expense") row.expenseMinor += event.amountMinor; else { row.transfersInMinor += event.amountMinor; row.transfersOutMinor += event.amountMinor; }
    row.netExternalCashFlowMinor = row.incomeMinor - row.expenseMinor; }
  const ending = dailySeries.at(-1) ?? { date: input.endDate, ...baseline };
  const fundBalances: Record<string, number> = Object.fromEntries((input.funds ?? []).map((fund) => [fund.id, fund.balanceMinor]));
  const fundActionsByDate = new Map<string, ProjectedFundActionInput[]>();
  for (const action of input.projectedFundActions ?? []) {
    if (!fundBalances.hasOwnProperty(action.fundId)) throw new Error(`Fund action ${action.id} requires a known fund`);
    if (action.date < input.asOfDate || action.date > input.endDate) continue;
    const list = fundActionsByDate.get(action.date) ?? []; list.push(action); fundActionsByDate.set(action.date, list);
  }
  const appliedFundActions: ForecastResult["projectedFundActions"] = [];
  const fundSeries = dailySeries.map((point) => {
    for (const action of (fundActionsByDate.get(point.date) ?? []).sort((a, b) => a.id.localeCompare(b.id))) {
      fundBalances[action.fundId] = (fundBalances[action.fundId] ?? 0) + action.amountMinor;
      appliedFundActions.push({ ...action, resultingBalanceMinor: fundBalances[action.fundId]! });
    }
    return { date: point.date, balancesMinor: { ...fundBalances } };
  });
  const lowestOperatingCash = dailySeries.reduce((low, point) => point.operatingCashMinor < low.balanceMinor ? { date: point.date, balanceMinor: point.operatingCashMinor } : low, { date: input.asOfDate, balanceMinor: baseline.operatingCashMinor });
  const lowestLiquidCash = dailySeries.reduce((low, point) => point.liquidCashMinor < low.balanceMinor ? { date: point.date, balanceMinor: point.liquidCashMinor } : low, { date: input.asOfDate, balanceMinor: baseline.liquidCashMinor });
  return { asOfDate: input.asOfDate, endDate: input.endDate, events: trace, overdueItems, dailySeries, monthly: [...byMonth.values()], endingAccountBalances: { ...balances },
    endingOperatingCashMinor: ending.operatingCashMinor, endingLiquidCashMinor: ending.liquidCashMinor, endingNetWorthMinor: ending.netWorthMinor,
    lowestOperatingCash, lowestLiquidCash, floorBreaches, firstFloorBreach: floorBreaches[0] ?? null, totals,
    scenario: { selectedIds: [...selected].sort(), eventCount: trace.filter((event) => event.scenarioId).length, conflicts },
    fundSeries, projectedFundActions: appliedFundActions, projectedFundGoalDates: {} };
}

export function addMonthsClamped(value: CalendarDate, months: number): CalendarDate { const date = utcDate(value); const index = monthIndex(value) + months; return clampedMonthDate(Math.floor(index / 12), index % 12, date.getUTCDate()); }
