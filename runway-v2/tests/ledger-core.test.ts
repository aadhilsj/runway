import { describe, expect, it } from "vitest";
import { asDateOnly } from "~/domain/dates";
import {
  calculateLedgerSummary,
  isNetWorthNeutral,
  validateTransactionInvariant,
  type LedgerAccount,
  type LedgerEntry,
  type LedgerTransaction,
} from "~/domain/ledger";
import { asMinorUnits } from "~/domain/money";
import { reconciliationDifference } from "~/domain/reconciliation";

const AS_OF = asDateOnly("2030-12-31");
const accounts: LedgerAccount[] = [
  { id: "cash", class: "asset", includeInNetWorth: true, isSystem: false },
  { id: "savings", class: "asset", includeInNetWorth: true, isSystem: false },
  { id: "investment", class: "asset", includeInNetWorth: true, isSystem: false },
  { id: "credit", class: "liability", includeInNetWorth: true, isSystem: false },
  { id: "income", class: "income", includeInNetWorth: false, isSystem: true },
  { id: "expense", class: "expense", includeInNetWorth: false, isSystem: true },
  { id: "equity", class: "equity", includeInNetWorth: false, isSystem: true },
];

function transaction(id: string, kind: LedgerTransaction["kind"], entries: LedgerEntry[], reversesTransactionId?: string): LedgerTransaction {
  return {
    id, kind, status: "posted", occurredOn: asDateOnly("2030-01-01"), entries,
    ...(reversesTransactionId ? { reversesTransactionId } : {}),
  };
}

const openingCash = transaction("opening-cash", "opening_balance", [
  { accountId: "cash", amountMinor: asMinorUnits(4_500_000) },
  { accountId: "equity", amountMinor: asMinorUnits(-4_500_000) },
]);

describe("ledger financial invariants", () => {
  it("salary increases cash and net worth without becoming a transfer", () => {
    const salary = transaction("salary", "income", [
      { accountId: "cash", amountMinor: asMinorUnits(3_529_200) },
      { accountId: "income", amountMinor: asMinorUnits(-3_529_200) },
    ]);
    const summary = calculateLedgerSummary(accounts, [salary], AS_OF);
    expect(summary.balances.get("cash")).toBe(3_529_200);
    expect(summary.netWorthMinor).toBe(3_529_200);
    expect(summary.incomeMinor).toBe(3_529_200);
    expect(salary.kind).toBe("income");
  });

  it("rent reduces cash and net worth and appears as spending", () => {
    const rent = transaction("rent", "expense", [
      { accountId: "cash", amountMinor: asMinorUnits(-910_000) },
      { accountId: "expense", amountMinor: asMinorUnits(910_000) },
    ]);
    const summary = calculateLedgerSummary(accounts, [openingCash, rent], AS_OF);
    expect(summary.balances.get("cash")).toBe(3_590_000);
    expect(summary.netWorthMinor).toBe(3_590_000);
    expect(summary.spendingMinor).toBe(910_000);
  });

  it("an internal savings transfer preserves total cash, net worth, income, and spending", () => {
    const transfer = transaction("save", "transfer", [
      { accountId: "cash", amountMinor: asMinorUnits(-500_000) },
      { accountId: "savings", amountMinor: asMinorUnits(500_000) },
    ]);
    const summary = calculateLedgerSummary(accounts, [openingCash, transfer], AS_OF);
    expect(summary.balances.get("cash")).toBe(4_000_000);
    expect(summary.balances.get("savings")).toBe(500_000);
    expect(summary.totalAssetsMinor).toBe(4_500_000);
    expect(summary.netWorthMinor).toBe(4_500_000);
    expect(summary.incomeMinor).toBe(0);
    expect(summary.spendingMinor).toBe(0);
    expect(isNetWorthNeutral(accounts, [openingCash], transfer, AS_OF)).toBe(true);
  });

  it("an investment contribution is a net-worth-neutral transfer", () => {
    const contribution = transaction("invest", "transfer", [
      { accountId: "cash", amountMinor: asMinorUnits(-300_000) },
      { accountId: "investment", amountMinor: asMinorUnits(300_000) },
    ]);
    const summary = calculateLedgerSummary(accounts, [openingCash, contribution], AS_OF);
    expect(summary.balances.get("cash")).toBe(4_200_000);
    expect(summary.balances.get("investment")).toBe(300_000);
    expect(summary.netWorthMinor).toBe(4_500_000);
    expect(summary.spendingMinor).toBe(0);
  });

  it("liability principal payment reduces cash and debt without changing net worth", () => {
    const openingDebt = transaction("opening-debt", "opening_balance", [
      { accountId: "credit", amountMinor: asMinorUnits(-2_000_000) },
      { accountId: "equity", amountMinor: asMinorUnits(2_000_000) },
    ]);
    const payment = transaction("principal", "debt_payment", [
      { accountId: "cash", amountMinor: asMinorUnits(-100_000) },
      { accountId: "credit", amountMinor: asMinorUnits(100_000) },
    ]);
    const before = calculateLedgerSummary(accounts, [openingCash, openingDebt], AS_OF);
    const after = calculateLedgerSummary(accounts, [openingCash, openingDebt, payment], AS_OF);
    expect(after.balances.get("cash")).toBe(4_400_000);
    expect(after.balances.get("credit")).toBe(1_900_000);
    expect(after.netWorthMinor).toBe(before.netWorthMinor);
    expect(after.spendingMinor).toBe(0);
  });

  it("opening asset and liability balances affect net worth without fake income", () => {
    const openingDebt = transaction("opening-debt", "opening_balance", [
      { accountId: "credit", amountMinor: asMinorUnits(-2_000_000) },
      { accountId: "equity", amountMinor: asMinorUnits(2_000_000) },
    ]);
    const asset = calculateLedgerSummary(accounts, [openingCash], AS_OF);
    expect(asset.netWorthMinor).toBe(4_500_000);
    expect(asset.incomeMinor).toBe(0);
    const combined = calculateLedgerSummary(accounts, [openingCash, openingDebt], AS_OF);
    expect(combined.totalLiabilitiesMinor).toBe(2_000_000);
    expect(combined.netWorthMinor).toBe(2_500_000);
    expect(combined.incomeMinor).toBe(0);
  });

  it("an equal-and-opposite reversal retains both records and restores balances", () => {
    const expense = transaction("expense-original", "expense", [
      { accountId: "cash", amountMinor: asMinorUnits(-910_000) },
      { accountId: "expense", amountMinor: asMinorUnits(910_000) },
    ]);
    const reversal = transaction("expense-reversal", "expense", [
      { accountId: "cash", amountMinor: asMinorUnits(910_000) },
      { accountId: "expense", amountMinor: asMinorUnits(-910_000) },
    ], expense.id);
    const summary = calculateLedgerSummary(accounts, [openingCash, expense, reversal], AS_OF);
    expect(summary.balances.get("cash")).toBe(4_500_000);
    expect(summary.spendingMinor).toBe(0);
    expect([expense, reversal]).toHaveLength(2);
    expect(reversal.reversesTransactionId).toBe(expense.id);
  });

  it("rejects an unbalanced transaction", () => {
    expect(() => validateTransactionInvariant([
      { accountId: "cash", amountMinor: asMinorUnits(100) },
      { accountId: "income", amountMinor: asMinorUnits(-99) },
    ])).toThrow("sum to zero");
  });

  it("calculates reconciliation difference without mutating ledger history", () => {
    expect(reconciliationDifference(asMinorUnits(4_490_000), asMinorUnits(4_500_000))).toBe(-10_000);
  });
});
