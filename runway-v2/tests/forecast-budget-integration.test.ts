import { afterEach, describe, expect, it, vi } from "vitest";
import { forecast } from "~/domain/forecast";
import { buildForecastScreenModel, toForecastInput } from "~/read-models/forecast";
import { buildOverviewReadModel } from "~/read-models/overview";
import { buildPlansComparison } from "~/read-models/plans";

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

function budgetWorkspace(groceriesSpentMinor: number, groceriesCommittedMinor = 0) {
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
    groups: [], groupCategories: [], commitments: groceriesCommittedMinor ? [
      { category_id: groceriesId, month_start: "2026-08-01", committed_minor: groceriesCommittedMinor },
    ] : [],
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

  it("does not count a categorized planned expense twice as both a commitment and remaining budget", () => {
    const groceriesItem = {
      id: "planned-groceries", kind: "expense", expected_date: "2026-08-28", amount_minor: 10_000,
      source_account_id: "operating", destination_account_id: null, category_id: groceriesId,
      label: "Groceries", notes: null, confidence: "expected", scenario_id: null,
      default_sort_order: 0, status: "expected",
    };
    const screen = buildForecastScreenModel(
      forecastWorkspace(100_000, [groceriesItem]), 1, [], "2026-08-24", budgetWorkspace(0, 10_000),
    );

    expect(screen.timeline.map((item) => ({ label: item.label, amountMinor: item.amountMinor }))).toEqual([
      { label: "Groceries", amountMinor: 10_000 },
      { label: "Groceries budget", amountMinor: 30_000 },
      { label: "Miscellaneous budget", amountMinor: 50_000 },
    ]);
    expect(screen.summary.expenseMinor).toBe(90_000);
    expect(screen.summary.projectedBalanceMinor).toBe(10_000);
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
});
