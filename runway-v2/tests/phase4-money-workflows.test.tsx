import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountsRoute from "~/routes/money-accounts";
import TransactionsRoute from "~/routes/money-transactions";
import ForecastRoute from "~/routes/forecast";

const mocks = vi.hoisted(() => ({
  createAccount: vi.fn(), reconcileAccount: vi.fn(), postExpense: vi.fn(), reverseTransaction: vi.fn(),
  operatingAccount: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: "owner", name: "Operating Cash", class: "asset" as const,
    subtype: "checking" as const, currency: "NOK", liquidity_class: "operating" as const, valuation_mode: "ledger" as const,
    include_in_net_worth: true, is_system: false, archived_at: null, opened_on: "2026-08-19", created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z", ledger_balance_minor: 1195600, display_balance_minor: 1195600,
  },
}));

vi.mock("~/data/repositories/accounts-repository", () => ({ accountsRepository: {
  listAccountsWithBalances: vi.fn().mockResolvedValue([mocks.operatingAccount]),
  listAccountTransactions: vi.fn().mockResolvedValue([]), createAccount: mocks.createAccount,
  renameAccount: vi.fn(), archiveAccount: vi.fn(),
} }));
vi.mock("~/data/repositories/balances-repository", () => ({ balancesRepository: {
  getCurrentNetWorth: vi.fn().mockResolvedValue([{ net_worth_minor: 1195600 }]),
} }));
vi.mock("~/data/repositories/snapshots-repository", () => ({ snapshotsRepository: {
  listBalanceSnapshots: vi.fn().mockResolvedValue([]), createBalanceSnapshot: vi.fn(), reconcileAccount: mocks.reconcileAccount,
} }));
vi.mock("~/data/repositories/categories-repository", () => ({ categoriesRepository: {
  listCategories: vi.fn().mockResolvedValue([{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Housing", kind: "expense" }]),
} }));
vi.mock("~/data/repositories/transactions-repository", () => ({ transactionsRepository: {
  listTransactions: vi.fn().mockResolvedValue([]), postIncome: vi.fn(), postExpense: mocks.postExpense,
  postTransfer: vi.fn(), postDebtPayment: vi.fn(), reverseTransaction: mocks.reverseTransaction,
} }));
vi.mock("~/data/repositories/forecast-repository", () => ({ forecastRepository: {
  listExpectedItems: vi.fn().mockResolvedValue([{ id: "forecast-a", expected_date: "2026-09-01", kind: "income", amount_minor: 200000,
    label: "Invented future income", categories: { name: "Income" }, scenarios: null }]),
} }));

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Phase 4 actual-money workflows", () => {
  it("creates an account and requires explicit confirmation before reconciliation", async () => {
    mocks.createAccount.mockResolvedValue("new-account");
    mocks.reconcileAccount.mockResolvedValue({ difference_minor: 4400 });
    renderWithQuery(<AccountsRoute />);
    expect((await screen.findAllByText((_, element) => element?.textContent?.replace(/\s/g, "") === "11956,00kr", { selector: "strong, span" })).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Savings" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(mocks.createAccount).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /Operating Cash/ }));
    const actual = await screen.findByLabelText("Actual bank balance");
    fireEvent.change(actual, { target: { value: "12000" } });
    const adjustment = screen.getByRole("button", { name: "Create adjustment" });
    expect(adjustment).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Create a confirmed adjustment"));
    fireEvent.click(adjustment);
    await waitFor(() => expect(mocks.reconcileAccount).toHaveBeenCalledOnce());
  });

  it("posts an expense through the actual transaction workflow", async () => {
    mocks.postExpense.mockResolvedValue("transaction-a");
    renderWithQuery(<TransactionsRoute />);
    await screen.findByRole("option", { name: "Operating Cash" });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "125.50" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Invented purchase" } });
    fireEvent.click(screen.getByRole("button", { name: "Post expense" }));
    await waitFor(() => expect(mocks.postExpense).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 12550, description: "Invented purchase" })));
  });

  it("keeps migrated plans visibly separate from actual money", async () => {
    renderWithQuery(<ForecastRoute />);
    expect(await screen.findByText("Invented future income")).toBeInTheDocument();
    expect(screen.getByText(/never changes your actual account balances/i)).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent?.replace(/\s/g, "") === "+2000,00kr", { selector: "strong" })).toBeInTheDocument();
  });
});
