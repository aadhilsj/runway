import { describe, expect, it } from "vitest";
import { calculateSafeToSpend, calculateUnallocatedCash, fundBackingIntegrity, recommendAllocations } from "~/domain/allocations";
import { calculateBudgetLine, deriveBudgetActual } from "~/domain/budgets";
import { forecast } from "~/domain/forecast";

describe("Phase 6 allocation engine", () => {
  const base = { asOfDate: "2026-10-01", safeAllocatableMinor: 2_000,
    fundBalancesMinor: { emergency: 4_500, travel: 2_500, home: 0 },
    goals: [{ fundId: "emergency", targetMinor: 5_000 }, { fundId: "travel", capMinor: 3_000 }],
    items: [
      { id: "emergency", label: "Emergency", mode: "recommended" as const, priority: 1, amountMinor: 1_000, active: true, destinationType: "fund" as const, destinationFundId: "emergency", stopBasis: "target" as const },
      { id: "home-redirect", label: "Emergency redirect", mode: "recommended" as const, priority: 2, amountMinor: 500, active: true, destinationType: "fund" as const, destinationFundId: "home", activationSourceItemId: "emergency" },
      { id: "travel", label: "Travel", mode: "recommended" as const, priority: 3, amountMinor: 1_000, active: true, destinationType: "fund" as const, destinationFundId: "travel", stopBasis: "cap" as const },
    ] };

  it("clamps targets and caps, activates redirects, and is deterministic", () => {
    const first = recommendAllocations(base); const second = recommendAllocations(base);
    expect(first).toEqual(second);
    expect(first.recommendations.map((row) => row.recommendedMinor)).toEqual([500, 500, 500]);
    expect(first.resultingFundBalancesMinor).toEqual({ emergency: 5_000, travel: 3_000, home: 500 });
  });

  it("protects the floor with partial low-priority contributions", () => {
    const result = recommendAllocations({ ...base, safeAllocatableMinor: 700 });
    expect(result.recommendations.map((row) => row.recommendedMinor)).toEqual([500, 200, 0]);
    expect(result.recommendations[1]!.reason).toBe("partially-funded");
    expect(result.recommendations[2]!.reason).toBe("operating-floor-protected");
  });

  it("never recommends manual items", () => {
    const result = recommendAllocations({ ...base, items: [{ ...base.items[0]!, mode: "manual" }] });
    expect(result.recommendations[0]).toMatchObject({ recommendedMinor: 0, reason: "manual-only" });
  });
});

describe("Phase 6 cash and budget invariants", () => {
  it("subtracts allocated cash once and clamps safe-to-spend", () => {
    const series = [{ date: "2026-10-01", balanceMinor: 20_000 }, { date: "2026-10-02", balanceMinor: 16_000 }];
    expect(calculateSafeToSpend({ actualCashMinor: 17_000, allocatedOperatingMinor: 2_000, operatingFloorMinor: 9_000,
      asOfDate: "2026-01-01", safetyWindowDays: 30, obligations: [{ date: "2026-01-10", amountMinor: 1_000 }] })).toBe(5_000);
    expect(calculateUnallocatedCash(20_000, [2_000, 3_000])).toBe(15_000);
    expect(fundBackingIntegrity(4_000, [2_000, 3_000]).valid).toBe(false);
  });

  it("uses posted expenses less refunds, excluding transfers", () => {
    const actual = deriveBudgetActual([
      { categoryId: "food", kind: "expense", amountMinor: 5_000, status: "posted" },
      { categoryId: "food", kind: "refund", amountMinor: 1_000, status: "posted" },
      { categoryId: "food", kind: "transfer", amountMinor: 9_999, status: "posted" },
      { categoryId: "food", kind: "expense", amountMinor: 2_000, status: "draft" },
    ], new Set(["food"]));
    expect(actual).toBe(4_000);
    expect(calculateBudgetLine({ budgetedMinor: 10_000, expenseMinor: 5_000, refundMinor: 1_000 }))
      .toMatchObject({ actualMinor: 4_000, remainingMinor: 6_000 });
  });
});

describe("fund forecast projection", () => {
  it("changes virtual fund balances without changing the backing account", () => {
    const result = forecast({ asOfDate: "2026-10-01", endDate: "2026-10-02", timezone: "Europe/Oslo", baseCurrency: "NOK", operatingFloorMinor: 9_000,
      accounts: [{ id: "cash", name: "Operating", class: "asset", subtype: "checking", liquidityClass: "operating", balanceMinor: 20_000, includeInNetWorth: true }],
      forecastItems: [], recurringRules: [], recurrenceExceptions: [], selectedScenarioIds: [],
      funds: [{ id: "emergency", name: "Emergency", balanceMinor: 0 }],
      projectedFundActions: [{ id: "a", date: "2026-10-02", fundId: "emergency", amountMinor: 5_000, label: "Payday" }] });
    expect(result.endingAccountBalances.cash).toBe(20_000);
    expect(result.fundSeries.at(-1)?.balancesMinor.emergency).toBe(5_000);
    expect(result.endingNetWorthMinor).toBe(20_000);
  });
});
