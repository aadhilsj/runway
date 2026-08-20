import { describe, expect, it } from "vitest";
import { calculateSafeToSpendTrace } from "~/domain/allocations";

describe("Phase 10.6 safe-to-spend", () => {
  it("uses only cash already owned and reserves expected obligations", () => {
    const trace = calculateSafeToSpendTrace({ actualCashMinor: 1_195_600, allocatedOperatingMinor: 0,
      operatingFloorMinor: 900_000, asOfDate: "2026-08-20", safetyWindowDays: 30,
      obligations: [{ date: "2026-08-20", amountMinor: 113_300, label: "Phone" }, { date: "2026-08-20", amountMinor: 39_300, label: "Ruter" }] });
    expect(trace.safeToSpendMinor).toBe(143_000);
  });

  it("does not add unreceived income to safe-to-spend", () => {
    const input = { actualCashMinor: 1_195_600, allocatedOperatingMinor: 0, operatingFloorMinor: 900_000,
      asOfDate: "2026-08-20", safetyWindowDays: 30, obligations: [{ date: "2026-08-22", amountMinor: 100_000 }] } as const;
    const withoutSalary = calculateSafeToSpendTrace(input);
    const withSalaryInForecast = calculateSafeToSpendTrace({ ...input, nextReliableIncomeDate: null });
    expect(withSalaryInForecast.safeToSpendMinor).toBe(withoutSalary.safeToSpendMinor);
    expect(withSalaryInForecast.safeToSpendMinor).toBe(195_600);
  });

  it("uses reliable income only as a window boundary", () => {
    const trace = calculateSafeToSpendTrace({ actualCashMinor: 2_000_000, allocatedOperatingMinor: 100_000,
      operatingFloorMinor: 900_000, asOfDate: "2026-08-20", safetyWindowDays: 30, nextReliableIncomeDate: "2026-08-25",
      obligations: [{ date: "2026-08-24", amountMinor: 300_000 }, { date: "2026-08-25", amountMinor: 400_000 }] });
    expect(trace.protectionEndDate).toBe("2026-08-24");
    expect(trace.reservedObligationsMinor).toBe(300_000);
    expect(trace.safeToSpendMinor).toBe(700_000);
  });
});
