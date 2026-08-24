import { describe, expect, it } from "vitest";
import { buildForecastScreenModel } from "~/read-models/forecast";

const groceriesId = "category-groceries";
const miscellaneousId = "category-miscellaneous";

function forecastWorkspace(balanceMinor: number) {
  return {
    profile: { timezone: "Europe/Oslo", base_currency: "NOK", operating_floor_minor: 0 },
    accounts: [{ id: "operating", name: "Operating Cash", class: "asset", subtype: "checking", liquidity_class: "operating", include_in_net_worth: true, is_system: false }],
    balances: [{ account_id: "operating", display_balance_minor: balanceMinor }],
    portfolioSnapshots: [], items: [], rules: [], occurrences: [], scenarios: [], funds: [], fundBalances: [],
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
    groups: [], groupCategories: [], commitments: [],
  } as any;
}

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
});
