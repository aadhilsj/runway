import { describe, expect, it } from "vitest";
import type {
  AnalyticsAccount,
  AnalyticsTransaction,
} from "~/domain/analytics";
import {
  applyPortfolioValuationsToNetWorth,
  buildInvestmentPositions,
  externalInvestmentFlows,
  investmentHistory,
  investmentPrincipal,
  latestPortfolioSnapshot,
  portfolioTotals,
  type PortfolioSnapshot,
} from "~/domain/investments";
const accounts: AnalyticsAccount[] = [
  {
    id: "cash",
    name: "Operating",
    class: "asset",
    subtype: "checking",
    liquidityClass: "operating",
    includeInNetWorth: true,
    isSystem: false,
  },
  {
    id: "invest-a",
    name: "Broker A",
    class: "asset",
    subtype: "investment",
    liquidityClass: "invested",
    includeInNetWorth: true,
    isSystem: false,
  },
  {
    id: "invest-b",
    name: "Broker B",
    class: "asset",
    subtype: "investment",
    liquidityClass: "invested",
    includeInNetWorth: true,
    isSystem: false,
  },
  {
    id: "equity",
    name: "Equity",
    class: "equity",
    subtype: "system",
    liquidityClass: "non_liquid",
    includeInNetWorth: false,
    isSystem: true,
  },
];
const tx = (
  id: string,
  kind: string,
  at: string,
  entries: Array<[string, number]>,
): AnalyticsTransaction => ({
  id,
  kind,
  status: "posted",
  occurredAt: at,
  description: id,
  reversesTransactionId: null,
  entries: entries.map(([accountId, amountMinor]) => ({
    accountId,
    amountMinor,
    categoryId: null,
  })),
});
const transactions = [
  tx("open", "opening_balance", "2026-08-01T09:00:00Z", [
    ["invest-a", 10_000],
    ["equity", -10_000],
  ]),
  tx("contribute", "transfer", "2026-08-02T09:00:00Z", [
    ["cash", -5_000],
    ["invest-a", 5_000],
  ]),
  tx("internal", "transfer", "2026-08-03T09:00:00Z", [
    ["invest-a", -2_000],
    ["invest-b", 2_000],
  ]),
  tx("withdraw", "transfer", "2026-08-04T09:00:00Z", [
    ["invest-a", -1_000],
    ["cash", 1_000],
  ]),
];
const snapshots: PortfolioSnapshot[] = [
  {
    id: "s1",
    accountId: "invest-a",
    valueMinor: 16_000,
    valuedAt: "2026-08-05T09:00:00Z",
    createdAt: "2026-08-05T09:01:00Z",
    notes: null,
  },
  {
    id: "s2",
    accountId: "invest-a",
    valueMinor: 17_000,
    valuedAt: "2026-08-05T09:00:00Z",
    createdAt: "2026-08-05T09:02:00Z",
    notes: null,
  },
];
describe("Phase 9 investment accounting", () => {
  it("counts opening principal and external contributions/withdrawals", () =>
    expect(investmentPrincipal("invest-a", transactions, accounts)).toBe(
      14_000,
    ));
  it("does not count investment-to-investment transfers as contributions", () =>
    expect(investmentPrincipal("invest-b", transactions, accounts)).toBe(0));
  it("lists only external contribution and withdrawal transfers", () =>
    expect(
      externalInvestmentFlows("invest-a", transactions, accounts).map(
        (row) => row.amountMinor,
      ),
    ).toEqual([5_000, -1_000]));
  it("clamps net principal at zero", () =>
    expect(
      investmentPrincipal(
        "invest-a",
        [
          ...transactions,
          tx("large-withdraw", "transfer", "2026-08-06T09:00:00Z", [
            ["invest-a", -50_000],
            ["cash", 50_000],
          ]),
        ],
        accounts,
      ),
    ).toBe(0));
  it("uses the latest-created snapshot when valued timestamps match", () =>
    expect(latestPortfolioSnapshot(snapshots, "invest-a")?.id).toBe("s2"));
  it("falls back to book value when an account has no snapshot", () =>
    expect(
      buildInvestmentPositions(
        accounts,
        new Map([
          ["invest-a", 12_000],
          ["invest-b", 2_000],
        ]),
        transactions,
        snapshots,
      ).find((r) => r.accountId === "invest-b")?.marketValueMinor,
    ).toBe(2_000));
  it("derives gain from market value minus principal", () =>
    expect(
      buildInvestmentPositions(
        accounts,
        new Map([["invest-a", 12_000]]),
        transactions,
        snapshots,
      )[0],
    ).toMatchObject({
      marketValueMinor: 17_000,
      principalMinor: 14_000,
      gainMinor: 3_000,
    }));
  it("aggregates multiple accounts without double counting book and market value", () =>
    expect(
      portfolioTotals(
        buildInvestmentPositions(
          accounts,
          new Map([
            ["invest-a", 12_000],
            ["invest-b", 2_000],
          ]),
          transactions,
          snapshots,
        ),
      ),
    ).toMatchObject({
      bookValueMinor: 14_000,
      marketValueMinor: 19_000,
      valuationAdjustmentMinor: 5_000,
    }));
  it("produces value/principal/gain history", () =>
    expect(
      investmentHistory("invest-a", transactions, accounts, snapshots).at(-1),
    ).toMatchObject({
      valueMinor: 17_000,
      principalMinor: 14_000,
      gainMinor: 3_000,
    }));
  it("carries a valuation adjustment into later net-worth points", () =>
    expect(
      applyPortfolioValuationsToNetWorth(
        [
          {
            date: "2026-08-05",
            netWorthMinor: 20_000,
            cashMinor: 5_000,
            authoritative: true,
          },
          {
            date: "2026-08-10",
            netWorthMinor: 20_000,
            cashMinor: 5_000,
            authoritative: true,
          },
        ],
        transactions,
        accounts,
        snapshots,
        "UTC",
      ).map((r) => r.netWorthMinor),
    ).toEqual([25_000, 25_000]));
});
