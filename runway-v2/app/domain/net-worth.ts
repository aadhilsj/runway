import type { MinorUnits } from "./types";
import { asMinorUnits } from "./money";

export function calculateNetWorth(assetBalances: readonly MinorUnits[], liabilityBalances: readonly MinorUnits[]): MinorUnits {
  return asMinorUnits(assetBalances.reduce((sum, value) => sum + value, 0) - liabilityBalances.reduce((sum, value) => sum + value, 0));
}

export function totalBalances(balances: readonly MinorUnits[]): MinorUnits {
  return asMinorUnits(balances.reduce((sum, value) => sum + value, 0));
}
