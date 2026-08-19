import { describe, expect, it } from "vitest";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";

describe("money boundary", () => {
  it("converts display NOK to integer minor units without float multiplication", () => {
    expect(parseDisplayAmountToMinor("35292")).toBe(3_529_200);
    expect(parseDisplayAmountToMinor("10,25")).toBe(1_025);
  });

  it("rejects unsafe or over-precise values", () => {
    expect(() => parseDisplayAmountToMinor("1.001")).toThrow();
    expect(() => asMinorUnits(1.2)).toThrow();
  });

  it("formats at the presentation boundary", () => {
    expect(formatMinorUnits(asMinorUnits(3_529_200), "NOK", "nb-NO")).toContain("35");
  });
});
