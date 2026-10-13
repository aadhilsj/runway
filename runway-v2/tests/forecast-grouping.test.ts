import { describe, expect, it } from "vitest";
import { forecastLabelIdentity, groupForecastOccurrences, type ForecastGroupingOccurrence } from "~/domain/forecast-grouping";

const occurrence = (id: string, label: string, amountMinor: number, date = "2027-01-15"): ForecastGroupingOccurrence => ({
  id,
  label,
  amountMinor,
  date,
  kind: "expense",
  sourceType: "forecast_item",
  sourceId: id,
});

describe("forecast assumption grouping", () => {
  it("normalizes month-prefixed rent labels into one identity", () => {
    expect(forecastLabelIdentity("Sep rent").labelKey).toBe("rent");
    expect(forecastLabelIdentity("December rent").labelKey).toBe("rent");
    expect(forecastLabelIdentity("Rent").labelKey).toBe("rent");
  });

  it("groups salary occurrences even when their amounts differ", () => {
    const groups = groupForecastOccurrences([
      { ...occurrence("one", "Salary", 2_300_000), kind: "income" },
      { ...occurrence("two", "September salary", 3_500_000, "2027-02-15"), kind: "income" },
    ], [], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "Salary", minimumAmountMinor: 2_300_000, maximumAmountMinor: 3_500_000 });
  });

  it("treats ChatGPT, Claude, and combined AI-tool labels as one family", () => {
    const groups = groupForecastOccurrences([
      occurrence("one", "GPT and Claude", 4_000),
      occurrence("two", "ChatGPT", 2_000),
      occurrence("three", "Claude", 2_500),
    ], [], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe("ChatGPT & Claude");
    expect(groups[0]!.labelVariants).toHaveLength(3);
  });

  it("applies persistent merge, separation, and rename preferences", () => {
    const items = [occurrence("one", "Internet", 5_000), occurrence("two", "Phone bill", 7_000)];
    const merged = groupForecastOccurrences(items, [
      { kind: "expense", label_key: "internet", group_key: "utilities" },
      { kind: "expense", label_key: "phone-bill", group_key: "utilities" },
    ], [{ kind: "expense", group_key: "utilities", display_name: "Connectivity" }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe("Connectivity");

    const separated = groupForecastOccurrences(items, [
      { kind: "expense", label_key: "phone-bill", group_key: "custom:phone" },
    ], [{ kind: "expense", group_key: "custom:phone", display_name: "Mobile" }]);
    expect(separated.map((group) => group.name)).toEqual(["Internet", "Mobile"]);
  });
});
