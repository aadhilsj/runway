import { describe, expect, it } from "vitest";
import { allocationInstructionSchema, allocationModeSchema, dateOnlySchema } from "~/domain/schemas";

describe("domain schemas", () => {
  it.each(["manual", "recommended", "automatic"])("accepts allocation mode %s", (mode) => {
    expect(allocationModeSchema.parse(mode)).toBe(mode);
  });

  it("requires a date-only value", () => {
    expect(dateOnlySchema.safeParse("2030-01-31").success).toBe(true);
    expect(dateOnlySchema.safeParse("2030-01-31T12:00:00Z").success).toBe(false);
  });

  it("requires an amount or percentage on an allocation", () => {
    const result = allocationInstructionSchema.safeParse({
      id: "instruction", planId: "plan", destinationFundId: "fund", mode: "manual",
      frequency: "once", priority: 0, active: true, startsOn: "2030-01-01",
    });
    expect(result.success).toBe(false);
  });
});
