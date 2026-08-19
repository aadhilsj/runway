import type { MinorUnits } from "./types";
import { asMinorUnits } from "./money";

export function calculateNetWorth(assetBalances: readonly MinorUnits[], liabilityBalances: readonly MinorUnits[]): MinorUnits {
  return asMinorUnits(assetBalances.reduce((sum, value) => sum + value, 0) - liabilityBalances.reduce((sum, value) => sum + value, 0));
}
