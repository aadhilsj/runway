import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForecastRoute from "~/routes/forecast";
import MonthlyForecastRoute, { forecastHorizonThroughMonth } from "~/routes/forecast-monthly";

const mocks = vi.hoisted(() => {
  const account = { id: "account-a", user_id: "owner", name: "Operating Cash", class: "asset", subtype: "checking", currency: "NOK", is_system: false, system_key: null, include_in_net_worth: true, liquidity_class: "operating", valuation_mode: "ledger", archived_at: null, created_at: "2026-01-01", updated_at: "2026-01-01", opened_on: null, creation_idempotency_key: null, creation_payload: null } as const;
  const workspace = { profile: { base_currency: "NOK", timezone: "Europe/Oslo", operating_floor_minor: 500000, forecast_horizon_months: 12 }, accounts: [account], balances: [{ account_id: account.id, display_balance_minor: 1000000 }],
  items: [{ id: "base", kind: "expense", expected_date: "2026-09-01", amount_minor: 100000, source_account_id: account.id, destination_account_id: null, category_id: null, label: "Base expense", notes: null, confidence: "expected", scenario_id: null, default_sort_order: null, status: "expected", updated_at: "2026-08-24T20:00:00Z" },
    { id: "scenario-item", kind: "expense", expected_date: "2026-09-02", amount_minor: 200000, source_account_id: account.id, destination_account_id: null, category_id: null, label: "Scenario expense", notes: null, confidence: "expected", scenario_id: "scenario-a", default_sort_order: null, status: "expected" }],
  rules: [{ id: "rule-a", kind: "expense", label: "Monthly fixture", notes: null, source_account_id: account.id, destination_account_id: null, category_id: null, amount_minor: 5000, frequency: "monthly", interval_count: 1, day_of_month: 10, day_of_week: null, start_on: "2026-09-10", end_on: null, default_sort_order: null, confidence: "expected", scenario_id: null, active: true, archived_at: null }],
    occurrences: [], scenarios: [{ id: "scenario-a", name: "Optional plan", status: "active", archived_at: null, comparison_enabled: false }], categories: [], transactions: [], reimbursementPools: [], reimbursementEntries: [] } as any;
  const updatePlan = vi.fn(async (id: string, values: { comparison_enabled?: boolean }) => { const plan = workspace.scenarios.find((item: { id: string }) => item.id === id); if (plan && values.comparison_enabled !== undefined) plan.comparison_enabled = values.comparison_enabled; });
  const planWorkspace = { forecast: workspace, funds: { profile: { safety_window_days: 30 }, items: [], goals: [] }, budgets: { periods: [], lines: [], groups: [], groupCategories: [], actuals: [], categories: [], currency: "NOK" }, plans: workspace.scenarios, changes: [] as any[], applications: [] };
  return { createItem: vi.fn(), createRule: vi.fn(), settleItem: vi.fn(), settlePlanItem: vi.fn(), settleOccurrence: vi.fn(), restoreException: vi.fn(), recordRepayment: vi.fn(), adjustPool: vi.fn(), saveMonthlyBaseline: vi.fn(), saveHorizon: vi.fn(), setActive: vi.fn(), archive: vi.fn(), updatePlan, account, workspace, planWorkspace };
});

vi.mock("~/data/repositories/forecast-repository", () => ({ forecastRepository: { getWorkspace: vi.fn().mockResolvedValue(mocks.workspace), saveHorizon: mocks.saveHorizon, createItem: mocks.createItem, updateItem: vi.fn(), purgeExpiredRecoverableItems: vi.fn().mockResolvedValue(undefined), matchItem: vi.fn(), settleItem: mocks.settleItem } }));
vi.mock("~/data/repositories/budgets-repository", () => ({ budgetsRepository: { getWorkspace: vi.fn().mockResolvedValue({ periods: [], lines: [], groups: [], groupCategories: [], actuals: [], categories: [], currency: "NOK" }) } }));
vi.mock("~/data/repositories/recurring-repository", () => ({ recurringRepository: { create: mocks.createRule, update: vi.fn(), setActive: mocks.setActive, archive: mocks.archive, setException: vi.fn(), restoreException: mocks.restoreException, settleOccurrence: mocks.settleOccurrence, saveMonthlyBaseline: mocks.saveMonthlyBaseline } }));
vi.mock("~/data/repositories/plans-repository", () => ({ plansRepository: { getWorkspace: vi.fn().mockResolvedValue(mocks.planWorkspace), updatePlan: mocks.updatePlan, settleItem: mocks.settlePlanItem } }));
vi.mock("~/data/repositories/reimbursements-repository", () => ({ reimbursementsRepository: { getWorkspace: vi.fn().mockResolvedValue({ pools: [], entries: [] }), recordRepayment: mocks.recordRepayment, adjustPool: mocks.adjustPool } }));
function show(ui: React.ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<MemoryRouter><QueryClientProvider client={client}>{ui}</QueryClientProvider></MemoryRouter>); }
afterEach(() => { cleanup(); mocks.workspace.occurrences = []; mocks.workspace.scenarios[0].comparison_enabled = false; mocks.workspace.items = mocks.workspace.items.filter((item: { id: string }) => item.id !== "splitwise-item"); mocks.workspace.accounts = mocks.workspace.accounts.filter((item: { id: string }) => item.id !== "receivable-a"); mocks.workspace.balances = mocks.workspace.balances.filter((item: { account_id: string }) => item.account_id !== "receivable-a"); mocks.workspace.reimbursementPools = []; mocks.workspace.reimbursementEntries = []; mocks.planWorkspace.changes = []; vi.clearAllMocks(); });

describe("Phase 5 forecast UI", () => {
  it("extends a forecast horizon through the entire selected end month", () => {
    expect(forecastHorizonThroughMonth("2027-08", "2026-08-24")).toBe(13);
    expect(forecastHorizonThroughMonth("2027-02", "2026-08-24")).toBe(7);
  });

  it("changes horizon and persists selected scenarios across remounts without mutating base input", async () => {
    const first = show(<ForecastRoute/>); expect(await screen.findByText("Base expense")).toBeVisible(); expect(screen.queryByText("Scenario expense")).not.toBeInTheDocument();
    expect(screen.getByText("Forecast period")).toBeVisible();
    const range = screen.getByText(/\d{2} \w{3} \d{4} – \d{2} \w{3} \d{4}/); expect(range).toBeVisible(); expect(range).not.toHaveTextContent(/As of|through/);
    fireEvent.click(screen.getByRole("button", { name: "24 months" })); expect(mocks.saveHorizon).toHaveBeenCalledWith(24);
    fireEvent.click(screen.getByLabelText("Optional plan")); expect(await screen.findByText("Scenario expense")).toBeVisible(); expect(mocks.workspace.items).toHaveLength(2);
    await waitFor(() => expect(mocks.updatePlan).toHaveBeenCalledWith("scenario-a", { comparison_enabled: true }));
    first.unmount(); show(<ForecastRoute/>);
    expect(await screen.findByLabelText("Optional plan")).toBeChecked();
    expect(await screen.findByText("Scenario expense")).toBeVisible();
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
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(within(dialog).getByLabelText("Date paid")).toHaveValue(localDate);
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark paid" }));
    await waitFor(() => expect(mocks.settleItem).toHaveBeenCalledWith(expect.objectContaining({
      itemId: "base", actualAmountMinor: 100000, occurredAt: `${localDate}T12:00:00.000Z`,
      sourceAccountId: mocks.account.id, destinationAccountId: null, categoryId: null, notes: null,
    })));
  });

  it("records a partial Splitwise repayment as a transfer and keeps the remainder forecasted", async () => {
    mocks.workspace.accounts.push({ ...mocks.account, id: "receivable-a", name: "Splitwise receivable", subtype: "cash", liquidity_class: "non_liquid", hidden_from_accounts: true });
    mocks.workspace.balances.push({ account_id: "receivable-a", display_balance_minor: 1765700 });
    mocks.workspace.items.push({ id: "splitwise-item", kind: "transfer", expected_date: "2026-09-10", amount_minor: 1765700, source_account_id: "receivable-a", destination_account_id: mocks.account.id, category_id: null, label: "Splitwise", notes: null, confidence: "expected", scenario_id: null, default_sort_order: null, status: "expected", updated_at: "2026-08-24T20:00:00Z" });
    mocks.workspace.reimbursementPools = [{ id: "pool-a", forecast_item_id: "splitwise-item", expected_date: "2026-09-10" }];
    mocks.workspace.reimbursementEntries = [{ id: "entry-a", pool_id: "pool-a", delta_minor: 1765700, description: "Opening Splitwise balance" }];
    mocks.recordRepayment.mockResolvedValue("transaction-repayment");
    show(<ForecastRoute/>);
    const label = await screen.findByText("Splitwise");
    const row = label.closest("article")!;
    expect(within(row).getByText("What makes up this total")).toBeVisible();
    fireEvent.click(within(row).getByRole("button", { name: "Mark received" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reimbursement amount received"), { target: { value: "100" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark received" }));
    await waitFor(() => expect(mocks.recordRepayment).toHaveBeenCalledWith(expect.objectContaining({ poolId: "pool-a", destinationAccountId: mocks.account.id, amountMinor: 10000 })));
    expect(mocks.settleItem).not.toHaveBeenCalled();
  });

  it("settles an older Plan-linked forecast item and identifies its Plan in the confirmation", async () => {
    mocks.workspace.scenarios[0].comparison_enabled = true;
    mocks.settlePlanItem.mockResolvedValue("transaction-a");
    show(<ForecastRoute/>);
    await screen.findByText("Scenario expense");

    fireEvent.click(screen.getAllByRole("button", { name: "Mark paid" }).find((button) => button.closest("article")?.textContent?.includes("Scenario expense"))!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Plan: Optional plan/)).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Date paid"), { target: { value: "2026-08-20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark paid" }));

    await waitFor(() => expect(mocks.settlePlanItem).toHaveBeenCalledWith(expect.objectContaining({
      scenarioChangeId: null, forecastItemId: "scenario-item", actualAmountMinor: 200000, occurredAt: "2026-08-20T12:00:00.000Z",
      sourceAccountId: mocks.account.id, destinationAccountId: null,
    })));
  });

  it("settles a current Plan change and removes the plan prefix before calling the repository", async () => {
    mocks.workspace.scenarios[0].comparison_enabled = true;
    mocks.planWorkspace.changes = [{
      id: "change-income", user_id: "owner", scenario_id: "scenario-a", change_type: "add_one_off_income",
      target_forecast_item_id: null, target_recurring_rule_id: null, target_allocation_item_id: null, target_goal_id: null,
      source_account_id: null, destination_account_id: mocks.account.id, category_id: null, fund_id: null,
      effective_on: "2026-09-03", effective_until: null, amount_minor: 150000, label: "Plan income", confidence: "expected",
      target_field: null, boolean_value: null, frequency: null, interval_count: null, day_of_month: null, day_of_week: null,
      payload_json: {}, sort_order: 0, created_at: "2026-08-24T20:00:00Z", updated_at: "2026-08-24T20:00:00Z",
    }];
    mocks.settlePlanItem.mockResolvedValue("transaction-b");
    show(<ForecastRoute/>);
    await screen.findByText("Plan income");

    fireEvent.click(screen.getByRole("button", { name: "Mark received" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark received" }));

    await waitFor(() => expect(mocks.settlePlanItem).toHaveBeenCalledWith(expect.objectContaining({
      scenarioChangeId: "change-income", forecastItemId: null, actualAmountMinor: 150000,
      sourceAccountId: null, destinationAccountId: mocks.account.id,
    })));
  });

  it("lists skipped recurring occurrences and restores one date without changing the rule", async () => {
    mocks.workspace.occurrences = [{ recurring_rule_id: "rule-a", occurrence_date: "2027-08-10", status: "skipped", updated_at: new Date().toISOString() }];
    mocks.restoreException.mockResolvedValue(undefined);
    show(<ForecastRoute/>);

    const skipped = await screen.findByText("Skipped and deleted occurrences");
    expect(skipped).toBeVisible();
    expect(screen.queryByText("10 Aug 2027 · −50 kr")).not.toBeVisible();
    fireEvent.click(skipped);
    expect(screen.getByText("10 Aug 2027 · −50 kr")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(mocks.restoreException).toHaveBeenCalledWith("rule-a", "2027-08-10"));
  });

  it("closes the forecast action menu when clicking elsewhere and labels removal as Delete", async () => {
    show(<ForecastRoute/>); await screen.findByText("Base expense");
    fireEvent.click(screen.getByRole("button", { name: "More actions for Base expense" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("heading", { name: "Forecast" }));
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
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
