import type { DateOnly, MinorUnits, TransactionKind } from "./types";
import { asMinorUnits } from "./money";

export type LedgerAccountClass = "asset" | "liability" | "income" | "expense" | "equity";
export type LedgerTransactionStatus = "draft" | "posted" | "void";

export interface LedgerAccount {
  id: string;
  class: LedgerAccountClass;
  includeInNetWorth: boolean;
  isSystem: boolean;
}

export interface LedgerEntry {
  accountId: string;
  amountMinor: MinorUnits;
}

export interface LedgerTransaction {
  id: string;
  kind: TransactionKind | "refund" | "reimbursement" | "debt_payment" | "opening_balance";
  status: LedgerTransactionStatus;
  occurredOn: DateOnly;
  entries: readonly LedgerEntry[];
  reversesTransactionId?: string;
}

export interface LedgerSummary {
  balances: ReadonlyMap<string, MinorUnits>;
  totalAssetsMinor: MinorUnits;
  totalLiabilitiesMinor: MinorUnits;
  netWorthMinor: MinorUnits;
  incomeMinor: MinorUnits;
  spendingMinor: MinorUnits;
}

export function entrySum(entries: readonly LedgerEntry[]): MinorUnits {
  return asMinorUnits(entries.reduce((sum, entry) => sum + entry.amountMinor, 0));
}

export function validateTransactionInvariant(entries: readonly LedgerEntry[]): void {
  if (entries.length < 2) throw new Error("A transaction requires at least two entries");
  if (entries.some((entry) => entry.amountMinor === 0)) throw new Error("Ledger entries cannot be zero");
  if (entrySum(entries) !== 0) throw new Error("Ledger entries must sum to zero");
}

export function displayBalanceForClass(rawBalanceMinor: MinorUnits, accountClass: LedgerAccountClass): MinorUnits {
  return asMinorUnits(accountClass === "asset" || accountClass === "expense" ? rawBalanceMinor : -rawBalanceMinor);
}

export function calculateLedgerSummary(
  accounts: readonly LedgerAccount[],
  transactions: readonly LedgerTransaction[],
  asOfDate: DateOnly,
): LedgerSummary {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const rawBalances = new Map(accounts.map((account) => [account.id, asMinorUnits(0)]));
  let income = 0;
  let spending = 0;

  for (const transaction of transactions) {
    if (transaction.status !== "posted" || transaction.occurredOn > asOfDate) continue;
    validateTransactionInvariant(transaction.entries);
    for (const entry of transaction.entries) {
      const account = accountById.get(entry.accountId);
      if (!account) throw new Error(`Unknown ledger account: ${entry.accountId}`);
      rawBalances.set(entry.accountId, asMinorUnits((rawBalances.get(entry.accountId) ?? 0) + entry.amountMinor));
      if (account.class === "income") income += -entry.amountMinor;
      if (account.class === "expense") spending += entry.amountMinor;
    }
  }

  const balances = new Map<string, MinorUnits>();
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    const display = displayBalanceForClass(rawBalances.get(account.id) ?? asMinorUnits(0), account.class);
    balances.set(account.id, display);
    if (!account.isSystem && account.includeInNetWorth && account.class === "asset") assets += display;
    if (!account.isSystem && account.includeInNetWorth && account.class === "liability") liabilities += display;
  }

  return {
    balances,
    totalAssetsMinor: asMinorUnits(assets),
    totalLiabilitiesMinor: asMinorUnits(liabilities),
    netWorthMinor: asMinorUnits(assets - liabilities),
    incomeMinor: asMinorUnits(income),
    spendingMinor: asMinorUnits(spending),
  };
}

export function isNetWorthNeutral(
  accounts: readonly LedgerAccount[],
  before: readonly LedgerTransaction[],
  transaction: LedgerTransaction,
  asOfDate: DateOnly,
): boolean {
  return calculateLedgerSummary(accounts, before, asOfDate).netWorthMinor
    === calculateLedgerSummary(accounts, [...before, transaction], asOfDate).netWorthMinor;
}
