// QA regression coverage added after the 2026-08-25 monthly-limit consistency audit.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildForecastScreenModel } from "~/read-models/forecast";
import { buildOverviewReadModel } from "~/read-models/overview";
import { buildPlansComparison } from "~/read-models/plans";

const groceriesId = "groceries";
const miscellaneousId = "miscellaneous";

function forecastWorkspace() {
  return {
    profile: { timezone: "Europe/Oslo", base_currency: "NOK", operating_floor_minor: 0, forecast_horizon_months: 6 },
    accounts: [{ id: "cash", name: "Operating Cash", class: "asset", subtype: "checking", liquidity_class: "operating", include_in_net_worth: true, is_system: false }],
    balances: [{ account_id: "cash", display_balance_minor: 2_000_000 }],
    categories: [{ id: groceriesId, name: "Groceries", kind: "expense" }, { id: miscellaneousId, name: "Miscellaneous", kind: "expense" }],
    portfolioSnapshots: [], rules: [], occurrences: [], scenarios: [], funds: [], fundBalances: [],
    items: [
      { id: "sept-misc", kind: "expense", expected_date: "2026-09-15", amount_minor: 147_700, source_account_id: "cash", destination_account_id: null, category_id: miscellaneousId, label: "Legacy categorized plans", notes: null, confidence: "expected", scenario_id: null, default_sort_order: null, status: "expected" },
      { id: "oct-misc", kind: "expense", expected_date: "2026-10-15", amount_minor: 50_000, source_account_id: "cash", destination_account_id: null, category_id: miscellaneousId, label: "GPT x Claude", notes: null, confidence: "expected", scenario_id: null, default_sort_order: null, status: "expected" },
      { id: "nov-misc", kind: "expense", expected_date: "2026-11-15", amount_minor: 400_000, source_account_id: "cash", destination_account_id: null, category_id: miscellaneousId, label: "Large planned item", notes: null, confidence: "expected", scenario_id: null, default_sort_order: null, status: "expected" },
    ],
  } as any;
}

function budgets() {
  const months = ["2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"];
  return {
    currency: "NOK",
    categories: [{ id: groceriesId, name: "Groceries", kind: "expense" }, { id: miscellaneousId, name: "Miscellaneous", kind: "expense" }],
    periods: months.map((month, index) => ({ id: `period-${index}`, month_start: month, currency: "NOK", status: "planned" })),
    lines: months.flatMap((_month, index) => [
      { id: `groceries-${index}`, budget_period_id: `period-${index}`, category_id: groceriesId, group_id: null, budgeted_minor: 150_000, rollover: false, notes: null },
      { id: `misc-${index}`, budget_period_id: `period-${index}`, category_id: miscellaneousId, group_id: null, budgeted_minor: 350_000, rollover: false, notes: null },
    ]),
    actuals: [], groups: [], groupCategories: [],
    commitments: [
      { category_id: miscellaneousId, month_start: "2026-09-01", committed_minor: 147_700 },
      { category_id: miscellaneousId, month_start: "2026-10-01", committed_minor: 50_000 },
      { category_id: miscellaneousId, month_start: "2026-11-01", committed_minor: 400_000 },
    ],
  } as any;
}

const funds = { profile: { safety_window_days: 30, operating_floor_minor: 0, base_currency: "NOK" }, balances: [], backing: [], funds: [], goals: [], items: [], plans: [] } as any;

afterEach(() => vi.useRealTimers());

describe("monthly limits stay identical across calculation paths", () => {
  it("keeps 1,500 groceries and 3,500 miscellaneous visible in every configured month", () => {
    const model = buildForecastScreenModel(forecastWorkspace(), 6, [], "2026-08-25", budgets());
    const budgetEvents = model.timeline.filter((item) => item.sourceType === "budget_remaining");

    expect(budgetEvents.filter((item) => item.label === "Groceries budget").map((item) => item.amountMinor)).toEqual(Array(5).fill(150_000));
    expect(budgetEvents.filter((item) => item.label === "Miscellaneous budget").map((item) => item.amountMinor)).toEqual(Array(5).fill(350_000));
  });

  it("uses the same corrected budget events in Forecast, Overview, and Plan comparison", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
    const forecast = forecastWorkspace();
    const budget = budgets();
    const screen = buildForecastScreenModel(forecast, 6, [], "2026-08-25", budget);
    const workspace = { forecast, funds, budgets: budget, plans: [], changes: [] } as any;
    const overview = buildOverviewReadModel({ ...workspace, transactions: [] }, "2027-01-31");
    const comparison = buildPlansComparison(workspace, [], "2026-08-25");

    expect(overview.projection.liquidCashMinor).toBe(screen.timeline.findLast((item) => item.date <= "2027-01-31")?.runningBalanceMinor);
    expect(comparison.base.result.endingOperatingCashMinor).toBe(screen.summary.projectedBalanceMinor);
    expect(overview.forecast.expenseMinor).toBe(screen.summary.expenseMinor);
  });
});
