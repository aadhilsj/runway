import type { Budget, MinorUnits } from "./types";

export function remainingBudget(budget: Budget, spentMinor: MinorUnits): MinorUnits {
  return (budget.limitMinor - spentMinor) as MinorUnits;
}
export interface BudgetLineCalculationInput { budgetedMinor: number; expenseMinor: number; refundMinor?: number; committedForecastMinor?: number }
export interface BudgetLineCalculation {
  budgetedMinor: number; actualMinor: number; committedMinor: number; remainingMinor: number;
  uncommittedMinor: number; varianceMinor: number; utilization: number;
}
export function calculateBudgetLine(input: BudgetLineCalculationInput): BudgetLineCalculation {
  const budgetedMinor = Math.max(0, Math.trunc(input.budgetedMinor));
  const actualMinor = Math.max(0, Math.trunc(input.expenseMinor) - Math.max(0, Math.trunc(input.refundMinor ?? 0)));
  const committedMinor = Math.max(0, Math.trunc(input.committedForecastMinor ?? 0));
  return { budgetedMinor, actualMinor, committedMinor, remainingMinor: budgetedMinor - actualMinor,
    uncommittedMinor: budgetedMinor - actualMinor - committedMinor, varianceMinor: budgetedMinor - actualMinor,
    utilization: budgetedMinor === 0 ? (actualMinor === 0 ? 0 : 1) : actualMinor / budgetedMinor };
}
export interface BudgetTransactionInput {
  categoryId: string | null; kind: "income" | "expense" | "transfer" | "refund" | "reimbursement" | "debt_payment" | "opening_balance" | "adjustment";
  amountMinor: number; status: "draft" | "posted" | "void";
}
/** Posted expense minus refunds. Transfers and virtual fund movements are excluded. */
export function deriveBudgetActual(transactions: readonly BudgetTransactionInput[], categoryIds: ReadonlySet<string>): number {
  return transactions.reduce((sum, row) => {
    if (row.status !== "posted" || !row.categoryId || !categoryIds.has(row.categoryId)) return sum;
    if (row.kind === "expense") return sum + Math.abs(row.amountMinor);
    if (row.kind === "refund" || row.kind === "reimbursement") return sum - Math.abs(row.amountMinor);
    return sum;
  }, 0);
}
