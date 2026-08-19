import { describe, expect, it } from "vitest";
import { expandRecurringRule, forecast, type ForecastInput, type RecurringRuleInput } from "~/domain/forecast";

const operating = { id: "operating", name: "Operating", class: "asset" as const, subtype: "checking" as const,
  liquidityClass: "operating" as const, balanceMinor: 100_000, includeInNetWorth: true };
const savings = { id: "savings", name: "Savings", class: "asset" as const, subtype: "savings" as const,
  liquidityClass: "liquid" as const, balanceMinor: 50_000, includeInNetWorth: true };
const investment = { id: "investment", name: "Investment", class: "asset" as const, subtype: "investment" as const,
  liquidityClass: "invested" as const, balanceMinor: 20_000, includeInNetWorth: true };
const liability = { id: "loan", name: "Loan", class: "liability" as const, subtype: "loan" as const,
  liquidityClass: "liability" as const, balanceMinor: 30_000, includeInNetWorth: true };
const monthlyRule: RecurringRuleInput = { id: "salary", kind: "income", label: "Salary", destinationAccountId: "operating",
  amountMinor: 35_292, frequency: "monthly", intervalCount: 1, dayOfMonth: 20, startOn: "2026-01-20", active: true };

function input(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return { asOfDate: "2026-01-01", endDate: "2026-12-31", timezone: "Europe/Oslo", baseCurrency: "NOK",
    operatingFloorMinor: 90_000, accounts: [operating, savings, investment, liability], forecastItems: [], recurringRules: [],
    recurrenceExceptions: [], selectedScenarioIds: [], ...overrides };
}

describe("recurrence expansion", () => {
  it("expands a monthly salary deterministically for 24 months", () => {
    const first = expandRecurringRule(monthlyRule, [], "2026-01-01", "2027-12-31");
    expect(first).toHaveLength(24); expect(first[0]?.date).toBe("2026-01-20"); expect(first.at(-1)?.date).toBe("2027-12-20");
    expect(expandRecurringRule(monthlyRule, [], "2026-01-01", "2027-12-31")).toEqual(first);
  });

  it("clamps the 31st and handles leap years", () => {
    const rule = { ...monthlyRule, id: "rent", kind: "expense" as const, sourceAccountId: "operating", destinationAccountId: null,
      dayOfMonth: 31, startOn: "2027-01-31" };
    expect(expandRecurringRule(rule, [], "2027-01-01", "2027-05-31").map((event) => event.date))
      .toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
    expect(expandRecurringRule({ ...rule, startOn: "2028-01-31" }, [], "2028-01-01", "2028-02-29").at(-1)?.date).toBe("2028-02-29");
  });

  it("supports weekly intervals, yearly anniversaries, and start/end bounds", () => {
    const weekly = { ...monthlyRule, frequency: "weekly" as const, intervalCount: 2, dayOfWeek: 1, startOn: "2026-01-01", endOn: "2026-02-01" };
    expect(expandRecurringRule(weekly, [], "2025-01-01", "2027-01-01").map((event) => event.date)).toEqual(["2026-01-05", "2026-01-19"]);
    const yearly = { ...monthlyRule, frequency: "yearly" as const, startOn: "2024-02-29", dayOfMonth: 29 };
    expect(expandRecurringRule(yearly, [], "2024-01-01", "2026-12-31").map((event) => event.date)).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
  });

  it("applies sparse skip and overrides without changing logical identity", () => {
    const exceptions = [
      { id: "skip", recurringRuleId: "salary", occurrenceDate: "2026-02-20", status: "skipped" as const },
      { id: "override", recurringRuleId: "salary", occurrenceDate: "2026-03-20", status: "overridden" as const, overrideDate: "2026-03-21", overrideAmountMinor: 40_000 },
    ];
    const events = expandRecurringRule(monthlyRule, exceptions, "2026-01-01", "2026-03-31");
    expect(events).toHaveLength(2); expect(events[1]).toMatchObject({ logicalId: "salary:2026-03-20", date: "2026-03-21", amountMinor: 40_000 });
  });
});

describe("forecast engine", () => {
  it("projects income, expense, and transfer account semantics", () => {
    const result = forecast(input({ forecastItems: [
      { id: "income", kind: "income", date: "2026-01-02", amountMinor: 20_000, destinationAccountId: "operating", label: "Income", status: "expected" },
      { id: "expense", kind: "expense", date: "2026-01-03", amountMinor: 10_000, sourceAccountId: "operating", label: "Expense", status: "expected" },
      { id: "transfer", kind: "transfer", date: "2026-01-04", amountMinor: 15_000, sourceAccountId: "operating", destinationAccountId: "savings", label: "Save", status: "expected" },
    ] }));
    expect(result.endingAccountBalances).toMatchObject({ operating: 95_000, savings: 65_000 });
    expect(result.endingNetWorthMinor).toBe(150_000); expect(result.totals).toEqual({ incomeMinor: 20_000, expenseMinor: 10_000, transferMinor: 15_000 });
  });

  it("keeps investment contributions neutral and reduces liabilities correctly", () => {
    const result = forecast(input({ forecastItems: [
      { id: "invest", kind: "transfer", date: "2026-01-02", amountMinor: 10_000, sourceAccountId: "operating", destinationAccountId: "investment", label: "Invest", status: "expected" },
      { id: "debt", kind: "transfer", date: "2026-01-03", amountMinor: 5_000, sourceAccountId: "operating", destinationAccountId: "loan", label: "Debt", status: "expected" },
    ] }));
    expect(result.endingAccountBalances).toMatchObject({ operating: 85_000, investment: 30_000, loan: 25_000 });
    expect(result.endingNetWorthMinor).toBe(140_000);
  });

  it("detects floor breaches and ignores events beyond the horizon", () => {
    const result = forecast(input({ endDate: "2026-01-31", forecastItems: [
      { id: "inside", kind: "expense", date: "2026-01-20", amountMinor: 20_000, sourceAccountId: "operating", label: "Inside", status: "expected" },
      { id: "outside", kind: "expense", date: "2026-02-01", amountMinor: 90_000, sourceAccountId: "operating", label: "Outside", status: "expected" },
    ] }));
    expect(result.lowestOperatingCash.balanceMinor).toBe(80_000); expect(result.firstFloorBreach).toMatchObject({ date: "2026-01-20", amountBelowFloorMinor: 10_000 });
    expect(result.totals.expenseMinor).toBe(20_000);
  });

  it("uses deterministic conservative same-day ordering", () => {
    const result = forecast(input({ forecastItems: [
      { id: "income", kind: "income", date: "2026-01-02", amountMinor: 10, destinationAccountId: "operating", label: "Income", status: "expected" },
      { id: "transfer", kind: "transfer", date: "2026-01-02", amountMinor: 10, sourceAccountId: "operating", destinationAccountId: "savings", label: "Transfer", status: "expected" },
      { id: "expense", kind: "expense", date: "2026-01-02", amountMinor: 10, sourceAccountId: "operating", label: "Expense", status: "expected" },
    ] }));
    expect(result.events.map((event) => event.kind)).toEqual(["expense", "income", "transfer"]);
  });

  it("excludes unresolved overdue items and surfaces them", () => {
    const result = forecast(input({ asOfDate: "2026-02-01", forecastItems: [
      { id: "overdue", kind: "expense", date: "2026-01-31", amountMinor: 1_000, sourceAccountId: "operating", label: "Overdue", status: "expected" },
    ] }));
    expect(result.events).toHaveLength(0); expect(result.overdueItems).toHaveLength(1); expect(result.endingOperatingCashMinor).toBe(100_000);
  });

  it("applies selected scenarios without mutating base data and reports conflicts", () => {
    const item = { id: "base", kind: "expense" as const, date: "2026-02-01", amountMinor: 1_000, sourceAccountId: "operating", label: "Base", status: "expected" as const };
    const original = structuredClone(item);
    const result = forecast(input({ forecastItems: [item], selectedScenarioIds: ["a", "b"], scenarioOverlays: [
      { scenarioId: "a", modifications: [{ baseSourceId: "base", amountMinor: 2_000 }] },
      { scenarioId: "b", modifications: [{ baseSourceId: "base", amountMinor: 3_000 }] },
    ] }));
    expect(result.scenario.conflicts).toEqual([{ sourceId: "base", scenarioIds: ["a", "b"] }]); expect(item).toEqual(original); expect(result.events).toHaveLength(0);
  });
});
