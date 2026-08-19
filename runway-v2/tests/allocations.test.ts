import { describe, expect, it } from "vitest";
import { evaluateAllocation } from "~/domain/allocations";
import { asDateOnly } from "~/domain/dates";
import { asMinorUnits } from "~/domain/money";
import type { AllocationInstruction } from "~/domain/types";

const instruction: AllocationInstruction = {
  id: "one", planId: "plan", destinationFundId: "fund", mode: "recommended",
  amountMinor: asMinorUnits(500), frequency: "monthly", priority: 1, active: true,
  accountFloorMinor: asMinorUnits(1_000), startsOn: asDateOnly("2030-01-01"),
};

describe("allocation eligibility", () => {
  it("honors the account floor", () => {
    expect(evaluateAllocation(instruction, asMinorUnits(999), asDateOnly("2030-02-01")).reason).toBe("below-floor");
  });

  it("does not execute or change the requested mode", () => {
    const result = evaluateAllocation(instruction, asMinorUnits(1_001), asDateOnly("2030-02-01"));
    expect(result).toEqual({ instructionId: "one", eligible: true, reason: "eligible" });
    expect(instruction.mode).toBe("recommended");
  });
});
