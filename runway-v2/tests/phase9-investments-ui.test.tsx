import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvestmentsRoute from "~/routes/investments";
vi.mock("~/data/repositories/investments-repository", () => ({
  investmentsRepository: {
    getWorkspace: vi.fn(async () => ({})),
    createSnapshot: vi.fn(),
    updateSnapshot: vi.fn(),
    removeSnapshot: vi.fn(),
  },
}));
const full = {
  currency: "NOK",
  positions: [
    {
      accountId: "invest",
      name: "Investments",
      bookValueMinor: 100000,
      marketValueMinor: 112000,
      principalMinor: 100000,
      gainMinor: 12000,
      gainRate: 0.12,
      valuationAdjustmentMinor: 12000,
      latestSnapshot: {
        id: "s",
        accountId: "invest",
        valueMinor: 112000,
        valuedAt: "2026-08-19T12:00:00Z",
        createdAt: "2026-08-19T12:00:01Z",
        notes: null,
      },
    },
  ],
  totals: {
    bookValueMinor: 100000,
    marketValueMinor: 112000,
    principalMinor: 100000,
    gainMinor: 12000,
    valuationAdjustmentMinor: 12000,
  },
  snapshots: [],
  transactions: [],
  accounts: [],
  history: () => [],
  contributions: () => [],
};
let model: any = full;
vi.mock("~/read-models/investments", () => ({
  buildInvestmentsReadModel: vi.fn(() => model),
}));
function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <InvestmentsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe("Phase 9 investments UI", () => {
  beforeEach(() => {
    cleanup();
    model = full;
  });
  it("shows value, principal, gain and the non-ledger explanation", async () => {
    show();
    expect((await screen.findAllByText("Portfolio value"))[0]).toBeVisible();
    expect(screen.getByText("Contributed principal")).toBeVisible();
    expect(screen.getByText("Gain / loss")).toBeVisible();
    expect(
      screen.getByText(/does not create a ledger transaction/),
    ).toBeVisible();
  });
  it("shows a useful zero-account state", async () => {
    model = {
      ...full,
      positions: [],
      totals: {
        bookValueMinor: 0,
        marketValueMinor: 0,
        principalMinor: 0,
        gainMinor: 0,
        valuationAdjustmentMinor: 0,
      },
    };
    show();
    expect(await screen.findByText("No investment accounts yet")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Create investment account" }),
    ).toHaveAttribute("href", "/money/accounts");
  });
});
