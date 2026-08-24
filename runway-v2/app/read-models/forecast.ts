import { addMonthsClamped, forecast, type ForecastInput, type ForecastResult } from "~/domain/forecast";
import type { forecastRepository } from "~/data/repositories/forecast-repository";
import type { budgetsRepository } from "~/data/repositories/budgets-repository";

export type ForecastWorkspace = Awaited<ReturnType<typeof forecastRepository.getWorkspace>>;
export type BudgetWorkspace = Awaited<ReturnType<typeof budgetsRepository.getWorkspace>>;

function monthEnd(monthStart: string): string {
  const date = new Date(`${monthStart}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function remainingBudgetItems(
  workspace: ForecastWorkspace,
  budgets: BudgetWorkspace | undefined,
  startDate: string,
  endDate: string,
) {
  if (!budgets) return [];
  const operatingAccount = workspace.accounts.find(
    (account) => !account.is_system && account.class === "asset" && account.liquidity_class === "operating",
  );
  if (!operatingAccount) return [];

  const trackedCategories = new Map(
    budgets.categories
      .filter((category) => ["groceries", "miscellaneous"].includes(category.name.trim().toLowerCase()))
      .map((category) => [category.id, category]),
  );
  const actuals = new Map(
    budgets.actuals.map((actual) => [`${actual.category_id}:${actual.month_start}`, Number(actual.actual_minor ?? 0)]),
  );

  return budgets.periods.flatMap((period) => {
    if (period.status === "closed") return [];
    const date = monthEnd(period.month_start);
    if (date < startDate || date > endDate) return [];

    return budgets.lines.flatMap((line) => {
      if (line.budget_period_id !== period.id || !line.category_id || line.group_id) return [];
      const category = trackedCategories.get(line.category_id);
      if (!category) return [];
      const spentMinor = actuals.get(`${category.id}:${period.month_start}`) ?? 0;
      const remainingMinor = Math.max(0, Number(line.budgeted_minor ?? 0) - spentMinor);
      if (remainingMinor === 0) return [];
      return [{
        id: `monthly-budget:${period.id}:${line.id}`,
        kind: "expense" as const,
        date,
        amountMinor: remainingMinor,
        sourceAccountId: operatingAccount.id,
        destinationAccountId: null,
        categoryId: category.id,
        label: `${category.name} budget`,
        notes: "Remaining monthly budget",
        confidence: "expected" as const,
        scenarioId: null,
        sortOrder: 90,
        status: "expected" as const,
        sourceType: "budget_remaining" as const,
      }];
    });
  });
}

export function calendarDateInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function toForecastInput(workspace: ForecastWorkspace, horizonMonths: number, selectedScenarioIds: string[], asOfDate?: string, budgetWorkspace?: BudgetWorkspace): ForecastInput {
  const profile = workspace.profile; const today = asOfDate ?? calendarDateInTimezone(profile.timezone);
  const endDate = addMonthsClamped(today, horizonMonths);
  const balances = new Map(workspace.balances.map((row) => [row.account_id, Number(row.display_balance_minor ?? 0)]));
  const latestValues = new Map<string,number>();
  for (const row of workspace.portfolioSnapshots ?? []) latestValues.set(row.account_id, Number(row.value_minor));
  return {
    asOfDate: today,
    endDate,
    timezone: profile.timezone,
    baseCurrency: profile.base_currency,
    operatingFloorMinor: Number(profile.operating_floor_minor ?? 0),
    accounts: workspace.accounts.filter((account) => !account.is_system).map((account) => ({
      id: account.id, name: account.name, class: account.class as "asset" | "liability",
      subtype: account.subtype as "checking" | "savings" | "cash" | "investment" | "credit_card" | "loan",
      liquidityClass: account.liquidity_class, balanceMinor: account.subtype === "investment" ? latestValues.get(account.id) ?? balances.get(account.id) ?? 0 : balances.get(account.id) ?? 0, includeInNetWorth: account.include_in_net_worth,
    })),
    forecastItems: [...workspace.items.map((item) => ({ id: item.id, kind: item.kind, date: item.expected_date, amountMinor: Number(item.amount_minor),
      sourceAccountId: item.source_account_id, destinationAccountId: item.destination_account_id, categoryId: item.category_id,
      label: item.label, notes: item.notes, confidence: item.confidence, scenarioId: item.scenario_id, sortOrder: item.default_sort_order, status: item.status })),
      ...remainingBudgetItems(workspace, budgetWorkspace, today, endDate)],
    recurringRules: workspace.rules.map((rule) => ({ id: rule.id, kind: rule.kind, label: rule.label, notes: rule.notes,
      sourceAccountId: rule.source_account_id, destinationAccountId: rule.destination_account_id, categoryId: rule.category_id,
      amountMinor: Number(rule.amount_minor), frequency: rule.frequency, intervalCount: rule.interval_count, dayOfMonth: rule.day_of_month,
      dayOfWeek: rule.day_of_week, startOn: rule.start_on, endOn: rule.end_on, defaultSortOrder: rule.default_sort_order,
      confidence: rule.confidence, scenarioId: rule.scenario_id, active: rule.active, isReliableIncome: rule.is_reliable_income })),
    recurrenceExceptions: workspace.occurrences.map((row) => ({ id: row.id, recurringRuleId: row.recurring_rule_id,
      occurrenceDate: row.occurrence_date, status: row.status, overrideDate: row.override_date, overrideAmountMinor: row.override_amount_minor,
      matchedTransactionId: row.matched_transaction_id, expectedAmountMinorSnapshot: row.expected_amount_minor_snapshot,
      expectedDateSnapshot: row.expected_date_snapshot })),
    selectedScenarioIds,
    funds: (workspace.funds ?? []).map((fund) => ({ id: fund.id, name: fund.name,
      balanceMinor: Number((workspace.fundBalances ?? []).find((row) => row.fund_id === fund.id)?.balance_minor ?? 0) })),
    projectedFundActions: [],
  };
}

export interface ForecastScreenModel {
  result: ForecastResult;
  summary: { startingCashMinor: number; projectedBalanceMinor: number; lowestOperatingMinor: number; incomeMinor: number; expenseMinor: number; overdueCount: number };
  chart: Array<{ date: string; operatingCashMinor: number; liquidCashMinor: number; netWorthMinor: number }>;
  timeline: Array<ForecastResult["events"][number] & { accountImpact: string; runningBalanceMinor: number }>;
}

export function buildForecastScreenModel(workspace: ForecastWorkspace, horizonMonths: number, selectedScenarioIds: string[], asOfDate?: string, budgetWorkspace?: BudgetWorkspace): ForecastScreenModel {
  const input = toForecastInput(workspace, horizonMonths, selectedScenarioIds, asOfDate, budgetWorkspace);
  const result = forecast(input);
  const accountNames = new Map(workspace.accounts.map((account) => [account.id, account.name]));
  const startingCashMinor = input.accounts.filter((account) => account.class === "asset" && account.liquidityClass === "operating").reduce((sum, account) => sum + account.balanceMinor, 0);
  return { result, summary: { startingCashMinor, projectedBalanceMinor: result.endingOperatingCashMinor, lowestOperatingMinor: result.lowestOperatingCash.balanceMinor,
    incomeMinor: result.totals.incomeMinor, expenseMinor: result.totals.expenseMinor, overdueCount: result.overdueItems.length },
    chart: result.dailySeries.map((point) => ({ date: point.date, operatingCashMinor: point.operatingCashMinor, liquidCashMinor: point.liquidCashMinor, netWorthMinor: point.netWorthMinor })),
    timeline: result.events.map((event) => ({ ...event, accountImpact: event.kind === "income" ? `Into ${accountNames.get(event.destinationAccountId ?? "") ?? "account"}` : event.kind === "expense" ? `From ${accountNames.get(event.sourceAccountId ?? "") ?? "account"}` : `${accountNames.get(event.sourceAccountId ?? "") ?? "account"} → ${accountNames.get(event.destinationAccountId ?? "") ?? "account"}`,
      runningBalanceMinor: event.operatingCashMinor })),
  };
}
