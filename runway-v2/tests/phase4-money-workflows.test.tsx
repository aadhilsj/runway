import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountsRoute from "~/routes/money-accounts";
import TransactionsRoute from "~/routes/money-transactions";
import ForecastRoute from "~/routes/forecast";

const mocks = vi.hoisted(() => ({
  createAccount: vi.fn(), reconcileAccount: vi.fn(), postExpense: vi.fn(), reverseTransaction: vi.fn(), settleItem: vi.fn(),
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
  listCategories: vi.fn().mockResolvedValue([
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Housing", kind: "expense" },
    { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Groceries", kind: "expense" },
    { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Miscellaneous", kind: "expense" },
  ]),
} }));
vi.mock("~/data/repositories/budgets-repository", () => ({ budgetsRepository: {
  getWorkspace: vi.fn().mockResolvedValue({
    periods: [], lines: [], groups: [], groupCategories: [], actuals: [], commitments: [],
    categories: [
      { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Groceries", kind: "expense" },
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Miscellaneous", kind: "expense" },
    ], currency: "NOK",
  }),
  createPeriod: vi.fn(), createLine: vi.fn(), updateLine: vi.fn(),
} }));
vi.mock("~/data/repositories/transactions-repository", () => ({ transactionsRepository: {
  listTransactions: vi.fn().mockResolvedValue([]), postIncome: vi.fn(), postExpense: mocks.postExpense,
  postTransfer: vi.fn(), postDebtPayment: vi.fn(), reverseTransaction: mocks.reverseTransaction,
} }));
vi.mock("~/data/repositories/forecast-repository", () => ({ forecastRepository: {
  getWorkspace: vi.fn().mockResolvedValue({
    profile: { base_currency: "NOK", timezone: "Europe/Oslo", operating_floor_minor: 1500000, forecast_horizon_months: 12 },
    accounts: [mocks.operatingAccount], balances: [{ account_id: mocks.operatingAccount.id, display_balance_minor: 1195600 }],
    items: [{ id: "forecast-a", expected_date: "2026-09-01", kind: "income", amount_minor: 200000, label: "Invented future income",
      category_id: null, confidence: "expected", destination_account_id: mocks.operatingAccount.id, source_account_id: null, notes: null,
      scenario_id: null, default_sort_order: null, status: "expected" }],
    rules: [], occurrences: [], scenarios: [], categories: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Income", kind: "income" }], transactions: [], funds: [], fundBalances: [], portfolioSnapshots: [],
  }),
  saveHorizon: vi.fn(), createItem: vi.fn(), updateItem: vi.fn(), matchItem: vi.fn(), settleItem: mocks.settleItem,
} }));
vi.mock("~/data/repositories/recurring-repository", () => ({ recurringRepository: { matchOccurrence: vi.fn(), setException: vi.fn(), settleOccurrence: vi.fn() } }));

function renderWithQuery(ui: React.ReactNode, initialEntry = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter initialEntries={[initialEntry]}><QueryClientProvider client={client}>{ui}</QueryClientProvider></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Phase 4 actual-money workflows", () => {
  it("creates an account and requires explicit confirmation before reconciliation", async () => {
    mocks.createAccount.mockResolvedValue("new-account");
    mocks.reconcileAccount.mockResolvedValue({ difference_minor: 4400 });
    renderWithQuery(<AccountsRoute />);
    expect((await screen.findAllByText((_, element) => element?.textContent?.replace(/\s/g, "") === "11956kr", { selector: "strong, span" })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Add transaction" }));
    await screen.findByRole("option", { name: "Operating Cash" });
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "125.50" } });
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Invented purchase" } });
    fireEvent.click(screen.getByRole("button", { name: "Post expense" }));
    await waitFor(() => expect(mocks.postExpense).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 12550, description: "Invented purchase" })));
  });

  it("logs variable spending directly from Activity", async () => {
    mocks.postExpense.mockResolvedValue("transaction-quick");
    renderWithQuery(<TransactionsRoute />);
    await screen.findByRole("heading", { name: "Log spending" });
    fireEvent.change(screen.getByLabelText("Quick spend amount"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Quick spend description"), { target: { value: "Invented grocery shop" } });
    fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
    await waitFor(() => expect(mocks.postExpense).toHaveBeenCalledWith(expect.objectContaining({
      accountId: mocks.operatingAccount.id,
      amountMinor: 30000,
      categoryId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      description: "Invented grocery shop",
    })));
  });

  it("supports direct links to the expense form", async () => {
    renderWithQuery(<TransactionsRoute />, "/money/transactions?new=expense");
    expect(await screen.findByRole("button", { name: "Post expense" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Expense" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps migrated plans visibly separate from actual money", async () => {
    renderWithQuery(<ForecastRoute />);
    expect(await screen.findByText("Invented future income")).toBeInTheDocument();
    expect(screen.getByText(/never changes your actual account balances/i)).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent?.replace(/\s/g, "") === "+2000kr", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark received" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mark received" }));
    expect(screen.getByLabelText("Exact amount")).toHaveValue("2000.00");
    expect(screen.getByLabelText("Actual date")).toHaveValue("2026-09-01");
    expect(screen.getByText(/records the real transaction once/i)).toBeVisible();
    const more = screen.getByLabelText("More actions for Invented future income");
    expect(more).toHaveAttribute("aria-label", "More actions for Invented future income");
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Skip" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(screen.queryByText("Match transaction…")).not.toBeInTheDocument();
  });
});
