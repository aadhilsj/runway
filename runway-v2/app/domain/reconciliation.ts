import type { MinorUnits } from "./types";
import { asMinorUnits } from "./money";

export function reconciliationDifference(observedBalanceMinor: MinorUnits, ledgerBalanceMinor: MinorUnits): MinorUnits {
  return asMinorUnits(observedBalanceMinor - ledgerBalanceMinor);
}
