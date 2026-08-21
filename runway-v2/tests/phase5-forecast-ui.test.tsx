import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForecastRoute from "~/routes/forecast";
import RecurringSettingsRoute from "~/routes/settings-recurring";

const mocks = vi.hoisted(() => {
  const account = { id: "account-a", user_id: "owner", name: "Operating Cash", class: "asset", subtype: "checking", currency: "NOK", is_system: false, system_key: null, include_in_net_worth: true, liquidity_class: "operating", valuation_mode: "ledger", archived_at: null, created_at: "2026-01-01", updated_at: "2026-01-01", opened_on: null, creation_idempotency_key: null, creation_payload: null } as const;
  const workspace = { profile: { base_currency: "NOK", timezone: "Europe/Oslo", operating_floor_minor: 500000, forecast_horizon_months: 12 }, accounts: [account], balances: [{ account_id: account.id, display_balance_minor: 1000000 }],
  items: [{ id: "base", kind: "expense", expected_date: "2026-09-01", amount_minor: 100000, source_account_id: account.id, destination_account_id: null, category_id: null, label: "Base expense", notes: null, confidence: "expected", scenario_id: null, default_sort_order: null, status: "expected" },
    { id: "scenario-item", kind: "expense", expected_date: "2026-09-02", amount_minor: 200000, source_account_id: account.id, destination_account_id: null, category_id: null, label: "Scenario expense", notes: null, confidence: "expected", scenario_id: "scenario-a", default_sort_order: null, status: "expected" }],
  rules: [{ id: "rule-a", kind: "expense", label: "Monthly fixture", notes: null, source_account_id: account.id, destination_account_id: null, category_id: null, amount_minor: 5000, frequency: "monthly", interval_count: 1, day_of_month: 10, day_of_week: null, start_on: "2026-09-10", end_on: null, default_sort_order: null, confidence: "expected", scenario_id: null, active: true, archived_at: null }],
    occurrences: [], scenarios: [{ id: "scenario-a", name: "Optional plan", archived_at: null }], categories: [], transactions: [] } as any;
  return { createRule: vi.fn(), saveHorizon: vi.fn(), setActive: vi.fn(), archive: vi.fn(), account, workspace };
});

vi.mock("~/data/repositories/forecast-repository", () => ({ forecastRepository: { getWorkspace: vi.fn().mockResolvedValue(mocks.workspace), saveHorizon: mocks.saveHorizon, createItem: vi.fn(), updateItem: vi.fn(), matchItem: vi.fn() } }));
vi.mock("~/data/repositories/recurring-repository", () => ({ recurringRepository: { create: mocks.createRule, update: vi.fn(), setActive: mocks.setActive, archive: mocks.archive } }));
function show(ui: React.ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); }
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Phase 5 forecast UI", () => {
  it("changes horizon and includes selected scenarios without mutating base input", async () => {
    show(<ForecastRoute/>); expect(await screen.findByText("Base expense")).toBeVisible(); expect(screen.queryByText("Scenario expense")).not.toBeInTheDocument();
    const range = screen.getByText(/\d{2} \w{3} – \d{2} \w{3}/); expect(range).toBeVisible(); expect(range).not.toHaveTextContent(/As of|through/);
    fireEvent.click(screen.getByRole("button", { name: "24 months" })); expect(mocks.saveHorizon).toHaveBeenCalledWith(24);
    fireEvent.click(screen.getByLabelText("Optional plan")); expect(await screen.findByText("Scenario expense")).toBeVisible(); expect(mocks.workspace.items).toHaveLength(2);
  });

  it("creates, pauses, and archives recurring rules through product controls", async () => {
    mocks.createRule.mockResolvedValue(undefined); show(<RecurringSettingsRoute/>); expect(await screen.findByText("Monthly fixture")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Pause" })); await waitFor(() => expect(mocks.setActive).toHaveBeenCalledWith("rule-a", false));
    fireEvent.click(screen.getByRole("button", { name: "Archive" })); await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith("rule-a"));
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "income" } }); fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Invented salary" } }); fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1000" } }); fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-10-01" } }); fireEvent.change(screen.getByLabelText("To account"), { target: { value: mocks.account.id } }); fireEvent.click(screen.getByRole("button", { name: "Create recurring rule" }));
    await waitFor(() => expect(mocks.createRule).toHaveBeenCalledWith(expect.objectContaining({ kind: "income", amount_minor: 100000, destination_account_id: mocks.account.id })));
  });
});
