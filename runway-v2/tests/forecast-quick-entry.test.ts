import { describe, expect, it } from "vitest";
import { parseForecastQuickEntry } from "~/domain/forecast-quick-entry";

describe("forecast quick entry", () => {
  const now = new Date(2026, 7, 24, 12);

  it("parses an expense with a named date", () => {
    expect(parseForecastQuickEntry("Phone bill 568 on 15 Sep", now)).toEqual({ kind: "expense", label: "Phone bill", amountMinor: 56800, expectedDate: "2026-09-15" });
  });

  it("uses a plus sign for income", () => {
    expect(parseForecastQuickEntry("Salary +23000 on 20 Sep", now)).toEqual({ kind: "income", label: "Salary", amountMinor: 2300000, expectedDate: "2026-09-20" });
  });

  it("accepts flexible order and an optional in before the month", () => {
    expect(parseForecastQuickEntry("phone bill 568 15 in September", now)).toEqual({ kind: "expense", label: "phone bill", amountMinor: 56800, expectedDate: "2026-09-15" });
    expect(parseForecastQuickEntry("15th Sep phone bill 568", now)).toEqual({ kind: "expense", label: "phone bill", amountMinor: 56800, expectedDate: "2026-09-15" });
  });

  it("rolls an omitted year into the future", () => {
    expect(parseForecastQuickEntry("Insurance 1200 on 10 Jan", now).expectedDate).toBe("2027-01-10");
  });
});
