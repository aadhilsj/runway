import type { Budget, MinorUnits } from "./types";
import { asMinorUnits } from "./money";

export function remainingBudget(budget: Budget, spentMinor: MinorUnits): MinorUnits {
  return asMinorUnits(budget.limitMinor - spentMinor);
}

// TODO(phase-2): define rollover, refunds, transfers, and category reassignment semantics.
