import { afterEach, describe, expect, it, vi } from "vitest";
import { forecast } from "~/domain/forecast";
import { buildForecastScreenModel, buildForecastScreenModelFromResult, toForecastInput } from "~/read-models/forecast";
import { buildOverviewReadModel } from "~/read-models/overview";
import { buildPlansComparison, buildSelectedPlansEvaluation } from "~/read-models/plans";

const groceriesId = "category-groceries";
const miscellaneousId = "category-miscellaneous";

function forecastWorkspace(balanceMinor: number, items: any[] = []) {
  return {
    profile: { timezone: "Europe/Oslo", base_currency: "NOK", operating_floor_minor: 0, forecast_horizon_months: 1 },
    accounts: [{ id: "operating", name: "Operating Cash", class: "asset", subtype: "checking", liquidity_class: "operating", include_in_net_worth: true, is_system: false }],
    balances: [{ account_id: "operating", display_balance_minor: balanceMinor }],
    categories: [
      { id: groceriesId, name: "Groceries", kind: "expense" },
      { id: miscellaneousId, name: "Miscellaneous", kind: "expense" },
    ],
    portfolioSnapshots: [], items, rules: [], occurrences: [], scenarios: [], funds: [], fundBalances: [],
  } as any;
}

function budgetWorkspace(groceriesSpentMinor: number) {
  return {
    currency: "NOK",
    periods: [{ id: "august", month_start: "2026-08-01", currency: "NOK", status: "open" }],
    categories: [
      { id: groceriesId, name: "Groceries", kind: "expense" },
      { id: miscellaneousId, name: "Miscellaneous", kind: "expense" },
    ],
    lines: [
      { id: "groceries-line", budget_period_id: "august", category_id: groceriesId, group_id: null, budgeted_minor: 40_000, rollover: false, notes: null },
      { id: "misc-line", budget_period_id: "august", category_id: miscellaneousId, group_id: null, budgeted_minor: 50_000, rollover: false, notes: null },
    ],
    actuals: [
      { category_id: groceriesId, month_start: "2026-08-01", actual_minor: groceriesSpentMinor },
      { category_id: miscellaneousId, month_start: "2026-08-01", actual_minor: 0 },
    ],
    groups: [], groupCategories: [],
  } as any;
}

function fundsWorkspace() {
  return {
    profile: { safety_window_days: 30, operating_floor_minor: 0, base_currency: "NOK" },
    balances: [], backing: [], funds: [], goals: [], items: [], plans: [],
  } as any;
}

afterEach(() => vi.useRealTimers());

describe("monthly budgets in Forecast", () => {
  it("shows separate month-end remaining amounts and does not double-count logged spending", () => {
    const beforeSpend = buildForecastScreenModel(
      forecastWorkspace(100_000), 1, [], "2026-08-24", budgetWorkspace(0),
    );
    const afterSpend = buildForecastScreenModel(
      forecastWorkspace(90_000), 1, [], "2026-08-24", budgetWorkspace(10_000),
    );

    expect(beforeSpend.timeline.map((item) => ({ label: item.label, date: item.date, amountMinor: item.amountMinor }))).toEqual([
      { label: "Groceries budget", date: "2026-08-31", amountMinor: 40_000 },
      { label: "Miscellaneous budget", date: "2026-08-31", amountMinor: 50_000 },
    ]);
    expect(afterSpend.timeline.map((item) => ({ label: item.label, date: item.date, amountMinor: item.amountMinor }))).toEqual([
      { label: "Groceries budget", date: "2026-08-31", amountMinor: 30_000 },
      { label: "Miscellaneous budget", date: "2026-08-31", amountMinor: 50_000 },
    ]);
    expect(afterSpend.timeline.every((item) => item.sourceType === "budget_remaining")).toBe(true);
    expect(beforeSpend.summary.projectedBalanceMinor).toBe(10_000);
    expect(afterSpend.summary.projectedBalanceMinor).toBe(10_000);
  });

  it("uses the same budget-aware spending total in the forecast and its breakdown", () => {
    const workspace = forecastWorkspace(100_000);
    const budgets = budgetWorkspace(0);
    const screen = buildForecastScreenModel(workspace, 1, [], "2026-08-24", budgets);
    const breakdown = forecast(toForecastInput(workspace, 1, [], "2026-08-24", budgets));

    expect(breakdown.totals.expenseMinor).toBe(90_000);
    expect(breakdown.totals.expenseMinor).toBe(screen.summary.expenseMinor);
  });

  it("keeps a categorized planned expense separate from the monthly limit", () => {
    const groceriesItem = {
      id: "planned-groceries", kind: "expense", expected_date: "2026-08-28", amount_minor: 10_000,
      source_account_id: "operating", destination_account_id: null, category_id: groceriesId,
      label: "Groceries", notes: null, confidence: "expected", scenario_id: null,
      default_sort_order: 0, status: "expected",
    };
    const screen = buildForecastScreenModel(
      forecastWorkspace(100_000, [groceriesItem]), 1, [], "2026-08-24", budgetWorkspace(0),
    );

    expect(screen.timeline.map((item) => ({ label: item.label, amountMinor: item.amountMinor }))).toEqual([
      { label: "Groceries", amountMinor: 10_000 },
      { label: "Groceries budget", amountMinor: 40_000 },
      { label: "Miscellaneous budget", amountMinor: 50_000 },
    ]);
    expect(screen.summary.expenseMinor).toBe(100_000);
    expect(screen.summary.projectedBalanceMinor).toBe(0);
  });

  it("keeps Forecast, Overview, and plan comparisons on the same projected-balance path", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const forecastData = forecastWorkspace(100_000);
    const budgets = budgetWorkspace(0);
    const funds = fundsWorkspace();
    const screen = buildForecastScreenModel(forecastData, 1, [], "2026-08-24", budgets);
    const planComparison = buildPlansComparison(
      { forecast: forecastData, funds, budgets, plans: [], changes: [] }, [], "2026-08-24",
    );
    const overview = buildOverviewReadModel({
      forecast: forecastData, funds, budgets, transactions: [], plans: [], changes: [],
    } as any, "2026-08-31");

    expect(planComparison.base.result.endingOperatingCashMinor).toBe(screen.summary.projectedBalanceMinor);
    expect(planComparison.base.result.totals.expenseMinor).toBe(screen.summary.expenseMinor);
    expect(overview.projection.liquidCashMinor).toBe(screen.summary.projectedBalanceMinor);
    expect(overview.forecast.expenseMinor).toBe(screen.summary.expenseMinor);
  });

  it("uses a Forecast-toggled Plan in every Overview projection calculation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const planItem = {
      id: "plan-expense", kind: "expense", expected_date: "2026-08-29", amount_minor: 25_000,
      source_account_id: "operating", destination_account_id: null, category_id: null,
      label: "Plan expense", notes: null, confidence: "expected", scenario_id: "plan-a",
      default_sort_order: 0, status: "expected",
    };
    const forecastData = forecastWorkspace(200_000, [planItem]);
    forecastData.scenarios = [{ id: "plan-a", name: "Plan A", comparison_enabled: true, status: "active" }];
    const budgets = budgetWorkspace(0);
    const funds = fundsWorkspace();
    const forecastWithPlan = buildForecastScreenModel(forecastData, 1, ["plan-a"], "2026-08-24", budgets);
    const overview = buildOverviewReadModel({
      forecast: forecastData, funds, budgets, transactions: [],
      plans: [{ id: "plan-a", name: "Plan A", description: null, status: "active", comparison_enabled: true }],
      changes: [],
    } as any, "2026-08-31");

    expect(overview.selectedPlanIds).toEqual(["plan-a"]);
    expect(overview.projection.liquidCashMinor).toBe(forecastWithPlan.summary.projectedBalanceMinor);
    expect(overview.forecast.endingOperatingCashMinor).toBe(forecastWithPlan.summary.projectedBalanceMinor);
    expect(overview.forecast.expenseMinor).toBe(forecastWithPlan.summary.expenseMinor);
    expect(overview.upcoming.some((item) => item.label === "Plan expense")).toBe(true);
  });

  it("keeps Overview unchanged when a Plan assumption is replaced by the matching actual balance movement", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const budgets = budgetWorkspace(0);
    const funds = fundsWorkspace();
    const plan = { id: "plan-a", name: "Plan A", description: null, status: "active", comparison_enabled: true };
    const change = {
      id: "plan-expense", scenario_id: plan.id, change_type: "add_one_off_expense", amount_minor: 25_000,
      label: "Plan expense", effective_on: "2026-08-29", source_account_id: "operating", destination_account_id: null,
      target_forecast_item_id: null, target_recurring_rule_id: null, target_allocation_item_id: null, target_goal_id: null,
      category_id: null, fund_id: null, effective_until: null, confidence: "expected", target_field: null,
      boolean_value: null, frequency: null, interval_count: null, day_of_month: null, day_of_week: null, payload_json: {}, sort_order: 0,
    };
    const beforeForecast = forecastWorkspace(200_000);
    beforeForecast.scenarios = [plan];
    const before = buildOverviewReadModel({ forecast: beforeForecast, funds, budgets, transactions: [], plans: [plan], changes: [change] } as any, "2026-08-31");

    const afterForecast = forecastWorkspace(175_000);
    afterForecast.scenarios = [plan];
    const after = buildOverviewReadModel({ forecast: afterForecast, funds, budgets, transactions: [], plans: [plan], changes: [] } as any, "2026-08-31");

    expect(after.projection.liquidCashMinor).toBe(before.projection.liquidCashMinor);
    expect(after.upcoming.some((item) => item.label === "Plan expense")).toBe(false);
  });

  it("combines every selected modern Plan identically in Forecast and Overview", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const forecastData = forecastWorkspace(30_000_000);
    forecastData.profile.forecast_horizon_months = 18;
    const plans = [
      { id: "ai", name: "AI Tool Expense", status: "active", comparison_enabled: true },
      { id: "lanka", name: "Lanka '26", status: "active", comparison_enabled: true },
      { id: "visa", name: "UK Visa + Nov Trip", status: "active", comparison_enabled: true },
    ];
    forecastData.scenarios = plans;
    const change = (id: string, scenarioId: string, type: string, amountMinor: number, label: string, date: string) => ({
      id, scenario_id: scenarioId, change_type: type, amount_minor: amountMinor, label, effective_on: date,
      source_account_id: type === "add_one_off_expense" ? "operating" : null,
      destination_account_id: type === "add_one_off_income" ? "operating" : null,
      target_forecast_item_id: null, target_recurring_rule_id: null, target_allocation_item_id: null, target_goal_id: null,
      category_id: null, fund_id: null, effective_until: null, confidence: "expected", target_field: null,
      boolean_value: null, frequency: null, interval_count: null, day_of_month: null, day_of_week: null, payload_json: {}, sort_order: 0,
    });
    const changes = [
      change("ai-income", "ai", "add_one_off_income", 150_000, "AI income", "2026-10-01"),
      change("lanka-cost", "lanka", "add_one_off_expense", 1_650_000, "Lanka costs", "2026-11-01"),
      change("visa-cost", "visa", "add_one_off_expense", 600_000, "UK Visa costs", "2026-11-15"),
    ];
    const budgets = { ...budgetWorkspace(0), periods: [], lines: [], actuals: [] };
    const workspace = { forecast: forecastData, funds: fundsWorkspace(), budgets, plans, changes } as any;
    const selected = plans.map((plan) => plan.id);
    const evaluation = buildSelectedPlansEvaluation(workspace, selected, "2026-08-24", 18);
    const screen = buildForecastScreenModelFromResult(forecastData, evaluation.applied.forecast, evaluation.result);
    const overview = buildOverviewReadModel({ ...workspace, transactions: [] } as any, "2027-08-31");

    expect(screen.timeline.filter((item) => item.sourceId.startsWith("plan:")).map((item) => item.label)).toEqual(["AI income", "Lanka costs", "UK Visa costs"]);
    expect(screen.summary.projectedBalanceMinor).toBe(27_900_000);
    expect(overview.selectedPlanIds).toEqual(selected);
    expect(overview.projection.liquidCashMinor).toBe(27_900_000);
    expect(overview.forecast.endingOperatingCashMinor).toBe(screen.summary.projectedBalanceMinor);
  });
});
