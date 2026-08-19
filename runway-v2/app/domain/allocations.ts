import type { AllocationInstruction, DateOnly, MinorUnits } from "./types";

export interface AllocationEvaluation {
  instructionId: string;
  eligible: boolean;
  reason: "eligible" | "inactive" | "outside-window" | "below-floor" | "below-threshold";
}

export function evaluateAllocation(
  instruction: AllocationInstruction,
  availableMinor: MinorUnits,
  asOfDate: DateOnly,
): AllocationEvaluation {
  if (!instruction.active) return { instructionId: instruction.id, eligible: false, reason: "inactive" };
  if (asOfDate < instruction.startsOn || (instruction.endsOn && asOfDate > instruction.endsOn)) {
    return { instructionId: instruction.id, eligible: false, reason: "outside-window" };
  }
  if (instruction.accountFloorMinor !== undefined && availableMinor < instruction.accountFloorMinor) {
    return { instructionId: instruction.id, eligible: false, reason: "below-floor" };
  }
  if (instruction.triggerThresholdMinor !== undefined && availableMinor < instruction.triggerThresholdMinor) {
    return { instructionId: instruction.id, eligible: false, reason: "below-threshold" };
  }
  return { instructionId: instruction.id, eligible: true, reason: "eligible" };
}

// TODO(phase-2): specify cap exhaustion, redirects, priority ties, and automatic-mode authorization.
