import type { Account, DateOnly, Entry, MinorUnits } from "./types";
import { asMinorUnits } from "./money";

export function accountBalanceAsOf(
  account: Account,
  entries: readonly Entry[],
  _asOfDate: DateOnly,
): MinorUnits {
  const delta = entries.filter((entry) => entry.accountId === account.id).reduce((sum, entry) => sum + entry.amountMinor, 0);
  return asMinorUnits(account.openingBalanceMinor + delta);
}

// TODO(phase-2): enforce balanced transfer-entry invariants when normalized persistence exists.
