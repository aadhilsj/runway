import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForecastRoute from "~/routes/forecast";
import MonthlyForecastRoute, { forecastHorizonThroughMonth } from "~/routes/forecast-monthly";

const mocks = vi.hoisted(() => {
  const account = { id: "account-a", user_id: "owner", name: "Operating Cash", class: "asset", subtype: "checking", currency: "NOK", is_system: false, system_key: null, include_in_net_worth: true, liquidity_class: "operating", valuation_mode: "ledger", archived_at: null, created_at: "2026-01-01", updated_at: "2026-01-01", opened_on: null, creation_idempotency_key: null, creation_payload: null } as const;
  const workspace = { profile: { base_currency: "NOK", timezone: "Europe/Oslo", operating_floor_minor: 500000, forecast_horizon_months: 12 }, accounts: [account], balances: [{ account_id: account.id, display_balance_minor: 1000000 }],
  items: [{ id: "base", kind: "expense", expected_date: "2026-09-01", amount_minor: 100000, source_account_id: account.id, destination_account_id: null, category_id: null, label: "Base expense", notes: null, confidence: "expected", scenario_id: null, default_sort_order: null, status: "expected" },
    { id: "scenario-item", kind: "expense", expected_date: "2026-09-02", amount_minor: 200000, source_account_id: account.id, destination_account_id: null, category_id: null, label: "Scenario expense", notes: null, confidence: "expected", scenario_id: "scenario-a", default_sort_order: null, status: "expected" }],
  rules: [{ id: "rule-a", kind: "expense", label: "Monthly fixture", notes: null, source_account_id: account.id, destination_account_id: null, category_id: null, amount_minor: 5000, frequency: "monthly", interval_count: 1, day_of_month: 10, day_of_week: null, start_on: "2026-09-10", end_on: null, default_sort_order: null, confidence: "expected", scenario_id: null, active: true, archived_at: null }],
    occurrences: [], scenarios: [{ id: "scenario-a", name: "Optional plan", archived_at: null }], categories: [], transactions: [] } as any;
  return { createItem: vi.fn(), createRule: vi.fn(), settleItem: vi.fn(), settleOccurrence: vi.fn(), restoreException: vi.fn(), saveMonthlyBaseline: vi.fn(), saveHorizon: vi.fn(), setActive: vi.fn(), archive: vi.fn(), account, workspace };
});

vi.mock("~/data/repositories/forecast-repository", () => ({ forecastRepository: { getWorkspace: vi.fn().mockResolvedValue(mocks.workspace), saveHorizon: mocks.saveHorizon, createItem: mocks.createItem, updateItem: vi.fn(), matchItem: vi.fn(), settleItem: mocks.settleItem } }));
vi.mock("~/data/repositories/budgets-repository", () => ({ budgetsRepository: { getWorkspace: vi.fn().mockResolvedValue({ periods: [], lines: [], groups: [], groupCategories: [], actuals: [], commitments: [], categories: [], currency: "NOK" }) } }));
vi.mock("~/data/repositories/recurring-repository", () => ({ recurringRepository: { create: mocks.createRule, update: vi.fn(), setActive: mocks.setActive, archive: mocks.archive, setException: vi.fn(), restoreException: mocks.restoreException, settleOccurrence: mocks.settleOccurrence, saveMonthlyBaseline: mocks.saveMonthlyBaseline } }));
function show(ui: React.ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<MemoryRouter><QueryClientProvider client={client}>{ui}</QueryClientProvider></MemoryRouter>); }
afterEach(() => { cleanup(); mocks.workspace.occurrences = []; vi.clearAllMocks(); });

describe("Phase 5 forecast UI", () => {
  it("extends a forecast horizon through the entire selected end month", () => {
    expect(forecastHorizonThroughMonth("2027-08", "2026-08-24")).toBe(13);
    expect(forecastHorizonThroughMonth("2027-02", "2026-08-24")).toBe(7);
  });

  it("changes horizon and includes selected scenarios without mutating base input", async () => {
    show(<ForecastRoute/>); expect(await screen.findByText("Base expense")).toBeVisible(); expect(screen.queryByText("Scenario expense")).not.toBeInTheDocument();
    expect(screen.getByText("Forecast period")).toBeVisible();
    const range = screen.getByText(/\d{2} \w{3} \d{4} – \d{2} \w{3} \d{4}/); expect(range).toBeVisible(); expect(range).not.toHaveTextContent(/As of|through/);
    fireEvent.click(screen.getByRole("button", { name: "24 months" })); expect(mocks.saveHorizon).toHaveBeenCalledWith(24);
    fireEvent.click(screen.getByLabelText("Optional plan")); expect(await screen.findByText("Scenario expense")).toBeVisible(); expect(mocks.workspace.items).toHaveLength(2);
  });

  it("adds a planned expense from one line using Operating Cash defaults", async () => {
    show(<ForecastRoute/>); await screen.findByText("Base expense");
    fireEvent.click(screen.getByRole("button", { name: "Add planned item" }));
    expect(screen.queryByLabelText("Confidence")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByLabelText("Confidence")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use quick entry" }));
    fireEvent.change(screen.getByLabelText("Describe the planned item"), { target: { value: "Phone bill 568 on 15 Sep 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to forecast" }));
    await waitFor(() => expect(mocks.createItem).toHaveBeenCalledWith(expect.objectContaining({ kind: "expense", label: "Phone bill", amount_minor: 56800, expected_date: "2026-09-15", confidence: "expected", source_account_id: mocks.account.id, destination_account_id: null })));
  });

  it("confirms a planned expense in a compact dialog without asking for the fields again", async () => {
    mocks.settleItem.mockResolvedValue(undefined); show(<ForecastRoute/>); await screen.findByText("Base expense");
    fireEvent.click(screen.getAllByRole("button", { name: "Mark paid" }).at(0)!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Mark this item as paid?" })).toBeVisible();
    expect(screen.queryByLabelText("Exact amount")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Actual date")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark paid" }));
    await waitFor(() => expect(mocks.settleItem).toHaveBeenCalledWith(expect.objectContaining({
      itemId: "base", actualAmountMinor: 100000, occurredAt: "2026-09-01T12:00:00.000Z",
      sourceAccountId: mocks.account.id, destinationAccountId: null, categoryId: null, notes: null,
    })));
  });

  it("lists skipped recurring occurrences and restores one date without changing the rule", async () => {
    mocks.workspace.occurrences = [{ recurring_rule_id: "rule-a", occurrence_date: "2027-08-10", status: "skipped" }];
    mocks.restoreException.mockResolvedValue(undefined);
    show(<ForecastRoute/>);

    const skipped = await screen.findByText("Skipped occurrences");
    expect(skipped).toBeVisible();
    expect(screen.queryByText("10 Aug 2027 · −50 kr")).not.toBeVisible();
    fireEvent.click(skipped);
    expect(screen.getByText("10 Aug 2027 · −50 kr")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(mocks.restoreException).toHaveBeenCalledWith("rule-a", "2027-08-10"));
  });

  it("builds a monthly baseline in bulk and preserves existing monthly rules", async () => {
    mocks.saveMonthlyBaseline.mockResolvedValue(undefined); show(<MonthlyForecastRoute/>);
    expect(await screen.findByDisplayValue("Monthly fixture")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Paste a list" }));
    fireEvent.change(screen.getByLabelText("Monthly items to import"), { target: { value: "+ Salary 40000 on 20\n- Rent 12000 on 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add these items" }));
    expect(screen.getByDisplayValue("Salary")).toBeVisible(); expect(screen.getByDisplayValue("Rent")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Monthly forecast starts"), { target: { value: "2026-09" } });
    fireEvent.change(screen.getByLabelText("Monthly forecast ends"), { target: { value: "2027-09" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to forecast" }));
    await waitFor(() => expect(mocks.saveMonthlyBaseline).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "rule-a", kind: "expense", amount_minor: 5000, start_on: "2026-09-01", end_on: "2027-09-30" }),
      expect.objectContaining({ kind: "income", label: "Salary", amount_minor: 4000000, day_of_month: 20, destination_account_id: mocks.account.id }),
      expect.objectContaining({ kind: "expense", label: "Rent", amount_minor: 1200000, day_of_month: 1, source_account_id: mocks.account.id }),
    ]), []));
    expect(mocks.saveHorizon).toHaveBeenCalled();
  });
});
