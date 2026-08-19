import { z } from "zod";
import { calculateSafeToSpend, recommendAllocations, type AllocationGoalInput, type AllocationPlanItemInput, type AllocationRecommendation } from "./allocations";
import { forecast, type ForecastInput, type ForecastResult, type OneOffForecastInput, type ProjectedFundActionInput, type RecurringRuleInput } from "./forecast";

export const scenarioChangeTypeSchema = z.enum([
  "add_one_off_income", "add_one_off_expense", "add_one_off_transfer", "modify_forecast_item", "suppress_forecast_item",
  "modify_recurring_rule", "pause_recurring_rule", "add_temporary_recurring_rule", "modify_fund_contribution",
  "pause_fund_contribution", "modify_payday_item", "modify_goal", "modify_operating_floor", "modify_safety_window", "modify_income_reliability",
]);
export type ScenarioChangeType = z.infer<typeof scenarioChangeTypeSchema>;

export const scenarioChangeSchema = z.object({
  id: z.string().min(1), scenarioId: z.string().min(1), changeType: scenarioChangeTypeSchema,
  targetForecastItemId: z.string().nullable().optional(), targetRecurringRuleId: z.string().nullable().optional(),
  targetAllocationItemId: z.string().nullable().optional(), targetGoalId: z.string().nullable().optional(),
  sourceAccountId: z.string().nullable().optional(), destinationAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(), fundId: z.string().nullable().optional(),
  effectiveOn: z.string().nullable().optional(), effectiveUntil: z.string().nullable().optional(),
  amountMinor: z.number().int().nonnegative().nullable().optional(), label: z.string().min(1).nullable().optional(),
  confidence: z.enum(["committed", "expected", "tentative"]).nullable().optional(),
  targetField: z.enum(["target", "preferred", "cap", "contribution", "active", "reliability"]).nullable().optional(),
  booleanValue: z.boolean().nullable().optional(), frequency: z.enum(["weekly", "monthly", "yearly"]).nullable().optional(),
  intervalCount: z.number().int().positive().nullable().optional(), dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(), payload: z.record(z.string(), z.unknown()).default({}), sortOrder: z.number().int().nonnegative().default(0),
}).superRefine((change, context) => {
  if (change.effectiveOn && change.effectiveUntil && change.effectiveUntil < change.effectiveOn) context.addIssue({ code: "custom", message: "End date must not precede start date" });
  if (change.changeType.startsWith("add_one_off") && (!change.effectiveOn || !change.amountMinor || !change.label)) context.addIssue({ code: "custom", message: "One-off assumptions require a date, positive amount, and label" });
});
export type ScenarioChange = z.infer<typeof scenarioChangeSchema>;

export interface PlanInput { id: string; name: string; description?: string | null; status: "draft" | "active" | "archived" | "applied"; changes: readonly ScenarioChange[] }
export interface ScenarioGoalInput extends AllocationGoalInput { id: string; name: string; preferredContributionMinor?: number | null }
export interface ScenarioBaseInput { forecast: ForecastInput; safetyWindowDays: number; allocationItems: readonly AllocationPlanItemInput[]; goals: readonly ScenarioGoalInput[] }
export interface ScenarioConflict { targetKey: string; planIds: string[]; changeIds: string[]; message: string }
export interface ScenarioAppliedInput extends ScenarioBaseInput { selectedPlanIds: string[]; conflicts: ScenarioConflict[] }
export interface ScenarioEvaluation { applied: ScenarioAppliedInput; result: ForecastResult; safeToSpendMinor: number; allocationRecommendations: AllocationRecommendation[]; goalCompletionDates: Record<string, string | null>; health: Array<{ kind: "neutral" | "warning"; label: string; detail: string }> }

function shiftDate(value: string, days: number): string { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function overlaps(a: ScenarioChange, b: ScenarioChange): boolean { const startA = a.effectiveOn ?? "0000-01-01", startB = b.effectiveOn ?? "0000-01-01"; const endA = a.effectiveUntil ?? "9999-12-31", endB = b.effectiveUntil ?? "9999-12-31"; return startA <= endB && startB <= endA; }
function targetKey(change: ScenarioChange): string | null {
  if (change.targetForecastItemId) return `forecast:${change.targetForecastItemId}`;
  if (change.targetRecurringRuleId) return `recurring:${change.targetRecurringRuleId}`;
  if (change.targetAllocationItemId) return `allocation:${change.targetAllocationItemId}`;
  if (change.targetGoalId) return `goal:${change.targetGoalId}:${change.targetField ?? "value"}`;
  if (change.changeType === "modify_operating_floor") return "profile:operating-floor";
  if (change.changeType === "modify_safety_window") return "profile:safety-window";
  return null;
}
export function detectScenarioConflicts(plans: readonly PlanInput[]): ScenarioConflict[] {
  const changes = plans.filter((plan) => plan.status === "active" || plan.status === "draft").flatMap((plan) => plan.changes.map((change) => ({ plan, change: scenarioChangeSchema.parse(change), key: targetKey(change) }))).filter((row) => row.key);
  const conflicts = new Map<string, { planIds: Set<string>; changeIds: Set<string> }>();
  for (let left = 0; left < changes.length; left++) for (let right = left + 1; right < changes.length; right++) { const a = changes[left]!, b = changes[right]!; if (a.plan.id === b.plan.id || a.key !== b.key || !overlaps(a.change, b.change)) continue; const entry = conflicts.get(a.key!) ?? { planIds: new Set(), changeIds: new Set() }; entry.planIds.add(a.plan.id); entry.planIds.add(b.plan.id); entry.changeIds.add(a.change.id); entry.changeIds.add(b.change.id); conflicts.set(a.key!, entry); }
  return [...conflicts].map(([key, value]) => ({ targetKey: key, planIds: [...value.planIds].sort(), changeIds: [...value.changeIds].sort(), message: `${value.changeIds.size} plan changes conflict` })).sort((a, b) => a.targetKey.localeCompare(b.targetKey));
}

function alterRecurringRule(rules: RecurringRuleInput[], change: ScenarioChange, pause: boolean): RecurringRuleInput[] {
  const index = rules.findIndex((rule) => rule.id === change.targetRecurringRuleId); if (index < 0) return rules;
  const rule = rules[index]!, start = change.effectiveOn ?? rule.startOn, until = change.effectiveUntil ?? null; const replacements: RecurringRuleInput[] = [];
  if (rule.startOn < start) replacements.push({ ...rule, endOn: shiftDate(start, -1) });
  if (!pause) replacements.push({ ...rule, id: `${rule.id}:plan:${change.id}`, startOn: start, endOn: until ?? rule.endOn ?? null, amountMinor: change.amountMinor ?? rule.amountMinor, scenarioId: change.scenarioId });
  if (until && (!rule.endOn || until < rule.endOn)) replacements.push({ ...rule, id: `${rule.id}:resume:${change.id}`, startOn: shiftDate(until, 1), endOn: rule.endOn ?? null });
  return [...rules.slice(0, index), ...replacements, ...rules.slice(index + 1)];
}

/** Pure deterministic overlay. Conflicting target changes are surfaced and omitted. */
export function applyPlans(base: ScenarioBaseInput, plans: readonly PlanInput[]): ScenarioAppliedInput {
  const selected = plans.filter((plan) => plan.status === "active" || plan.status === "draft").toSorted((a, b) => a.id.localeCompare(b.id));
  const conflicts = detectScenarioConflicts(selected), blocked = new Set(conflicts.flatMap((conflict) => conflict.changeIds));
  let forecastItems = base.forecast.forecastItems.map((item) => ({ ...item })), recurringRules = base.forecast.recurringRules.map((rule) => ({ ...rule }));
  let fundActions = (base.forecast.projectedFundActions ?? []).map((action) => ({ ...action })), allocationItems = base.allocationItems.map((item) => ({ ...item })), goals = base.goals.map((goal) => ({ ...goal }));
  let operatingFloorMinor = base.forecast.operatingFloorMinor, safetyWindowDays = base.safetyWindowDays;
  const ordered = selected.flatMap((plan) => plan.changes.map((change) => scenarioChangeSchema.parse(change))).toSorted((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  for (const change of ordered) {
    if (blocked.has(change.id) || (change.effectiveUntil && change.effectiveUntil < base.forecast.asOfDate)) continue;
    const oneOff = (kind: "income" | "expense" | "transfer"): OneOffForecastInput => ({ id: `plan:${change.id}`, kind, date: change.effectiveOn!, amountMinor: change.amountMinor!, sourceAccountId: change.sourceAccountId ?? null, destinationAccountId: change.destinationAccountId ?? null, categoryId: change.categoryId ?? null, label: change.label!, confidence: change.confidence ?? "expected", scenarioId: change.scenarioId, status: "expected" });
    if (change.changeType === "add_one_off_income") forecastItems.push(oneOff("income"));
    else if (change.changeType === "add_one_off_expense") { forecastItems.push(oneOff("expense")); if (change.fundId) fundActions.push({ id: `plan-fund:${change.id}`, date: change.effectiveOn!, fundId: change.fundId, amountMinor: -change.amountMinor!, label: change.label! }); }
    else if (change.changeType === "add_one_off_transfer") forecastItems.push(oneOff("transfer"));
    else if (change.changeType === "modify_forecast_item") forecastItems = forecastItems.map((item) => item.id === change.targetForecastItemId ? { ...item, amountMinor: change.amountMinor ?? item.amountMinor, date: change.effectiveOn ?? item.date, label: change.label ?? item.label } : item);
    else if (change.changeType === "suppress_forecast_item") forecastItems = forecastItems.map((item) => item.id === change.targetForecastItemId ? { ...item, status: "canceled" } : item);
    else if (change.changeType === "modify_recurring_rule") recurringRules = alterRecurringRule(recurringRules, change, false);
    else if (change.changeType === "pause_recurring_rule") recurringRules = alterRecurringRule(recurringRules, change, true);
    else if (change.changeType === "add_temporary_recurring_rule") recurringRules.push({ id: `plan-rule:${change.id}`, kind: String(change.payload.kind ?? "expense") as "income" | "expense" | "transfer", label: change.label!, sourceAccountId: change.sourceAccountId ?? null, destinationAccountId: change.destinationAccountId ?? null, categoryId: change.categoryId ?? null, amountMinor: change.amountMinor!, frequency: change.frequency!, intervalCount: change.intervalCount ?? 1, dayOfMonth: change.dayOfMonth ?? null, dayOfWeek: change.dayOfWeek ?? null, startOn: change.effectiveOn!, endOn: change.effectiveUntil ?? null, confidence: change.confidence ?? "expected", scenarioId: change.scenarioId, active: true });
    else if (["modify_fund_contribution", "modify_payday_item"].includes(change.changeType)) allocationItems = allocationItems.map((item) => item.id === change.targetAllocationItemId ? { ...item, amountMinor: change.amountMinor ?? item.amountMinor } : item);
    else if (change.changeType === "pause_fund_contribution") allocationItems = allocationItems.map((item) => item.id === change.targetAllocationItemId ? { ...item, active: false } : item);
    else if (change.changeType === "modify_goal") goals = goals.map((goal) => goal.id !== change.targetGoalId ? goal : ({ ...goal, targetMinor: change.targetField === "target" ? change.amountMinor ?? null : goal.targetMinor ?? null, preferredMinor: change.targetField === "preferred" ? change.amountMinor ?? null : goal.preferredMinor ?? null, capMinor: change.targetField === "cap" ? change.amountMinor ?? null : goal.capMinor ?? null }));
    else if (change.changeType === "modify_operating_floor") operatingFloorMinor = change.amountMinor ?? operatingFloorMinor;
    else if (change.changeType === "modify_safety_window") safetyWindowDays = change.amountMinor ?? safetyWindowDays;
  }
  return { forecast: { ...base.forecast, operatingFloorMinor, forecastItems, recurringRules, projectedFundActions: fundActions, selectedScenarioIds: selected.map((plan) => plan.id) }, safetyWindowDays, allocationItems, goals, selectedPlanIds: selected.map((plan) => plan.id), conflicts };
}

export function evaluatePlans(base: ScenarioBaseInput, plans: readonly PlanInput[]): ScenarioEvaluation {
  const applied = applyPlans(base, plans), first = forecast(applied.forecast), allocated = applied.forecast.funds?.reduce((sum, fund) => sum + fund.balanceMinor, 0) ?? 0;
  const safeToSpendMinor = calculateSafeToSpend({ dailyOperatingCash: first.dailySeries.map((point) => ({ date: point.date, balanceMinor: point.operatingCashMinor })), allocatedOperatingMinor: allocated, operatingFloorMinor: applied.forecast.operatingFloorMinor, safetyWindowDays: applied.safetyWindowDays });
  const allocation = recommendAllocations({ asOfDate: applied.forecast.asOfDate, safeAllocatableMinor: safeToSpendMinor, items: applied.allocationItems, fundBalancesMinor: Object.fromEntries((applied.forecast.funds ?? []).map((fund) => [fund.id, fund.balanceMinor])), goals: applied.goals });
  const allocationActions: ProjectedFundActionInput[] = allocation.recommendations.filter((row) => row.destinationFundId && row.recommendedMinor > 0).map((row) => ({ id: `plan-allocation:${row.itemId}`, date: applied.forecast.asOfDate, fundId: row.destinationFundId!, amountMinor: row.recommendedMinor, label: row.label }));
  const result = forecast({ ...applied.forecast, projectedFundActions: [...(applied.forecast.projectedFundActions ?? []), ...allocationActions] });
  const goalCompletionDates: Record<string, string | null> = {};
  for (const goal of applied.goals) { const threshold = goal.targetMinor ?? goal.preferredMinor ?? goal.capMinor; goalCompletionDates[goal.id] = threshold == null ? null : result.fundSeries.find((point) => (point.balancesMinor[goal.fundId] ?? 0) >= threshold)?.date ?? null; }
  result.projectedFundGoalDates = goalCompletionDates;
  const health: ScenarioEvaluation["health"] = [result.floorBreaches.length ? { kind: "warning", label: "Operating floor breached", detail: `${result.floorBreaches.length} projected breach${result.floorBreaches.length === 1 ? "" : "es"}.` } : { kind: "neutral", label: "No floor breach", detail: "Operating cash stays above the selected floor." }];
  if (result.lowestOperatingCash.balanceMinor < 0) health.push({ kind: "warning", label: "Negative projected cash", detail: `First low point is ${result.lowestOperatingCash.date}.` });
  for (const [fundId, balance] of Object.entries(result.fundSeries.at(-1)?.balancesMinor ?? {})) if (balance < 0) health.push({ kind: "warning", label: "Fund depleted", detail: `Fund ${fundId} falls below zero.` });
  return { applied, result, safeToSpendMinor, allocationRecommendations: allocation.recommendations, goalCompletionDates, health };
}

export interface PlanComparisonAlternative { planIds: string[]; label: string; evaluation: ScenarioEvaluation; deltas: { endingOperatingCashMinor: number; endingLiquidCashMinor: number; endingNetWorthMinor: number; lowestOperatingCashMinor: number; safeToSpendMinor: number; incomeMinor: number; expenseMinor: number; floorBreachCount: number } }
export interface PlanComparison { base: ScenarioEvaluation; alternatives: PlanComparisonAlternative[] }
export function comparePlans(base: ScenarioBaseInput, alternatives: readonly { label: string; plans: readonly PlanInput[] }[]): PlanComparison {
  const baseline = evaluatePlans(base, []);
  return { base: baseline, alternatives: alternatives.slice(0, 3).map(({ label, plans }) => { const evaluation = evaluatePlans(base, plans); return { label, planIds: evaluation.applied.selectedPlanIds, evaluation, deltas: { endingOperatingCashMinor: evaluation.result.endingOperatingCashMinor - baseline.result.endingOperatingCashMinor, endingLiquidCashMinor: evaluation.result.endingLiquidCashMinor - baseline.result.endingLiquidCashMinor, endingNetWorthMinor: evaluation.result.endingNetWorthMinor - baseline.result.endingNetWorthMinor, lowestOperatingCashMinor: evaluation.result.lowestOperatingCash.balanceMinor - baseline.result.lowestOperatingCash.balanceMinor, safeToSpendMinor: evaluation.safeToSpendMinor - baseline.safeToSpendMinor, incomeMinor: evaluation.result.totals.incomeMinor - baseline.result.totals.incomeMinor, expenseMinor: evaluation.result.totals.expenseMinor - baseline.result.totals.expenseMinor, floorBreachCount: evaluation.result.floorBreaches.length - baseline.result.floorBreaches.length } }; }) };
}
