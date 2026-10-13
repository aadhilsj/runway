import type {
  AnalyticsAccount,
  AnalyticsTransaction,
  NetWorthPoint,
} from "./analytics";

export interface PortfolioSnapshot {
  id: string;
  accountId: string;
  valueMinor: number;
  valuedAt: string;
  createdAt: string;
  notes: string | null;
}
export interface InvestmentPosition {
  accountId: string;
  name: string;
  bookValueMinor: number;
  marketValueMinor: number;
  principalMinor: number;
  gainMinor: number;
  gainRate: number | null;
  valuationAdjustmentMinor: number;
  latestSnapshot: PortfolioSnapshot | null;
}

function orderedSnapshots(rows: readonly PortfolioSnapshot[]) {
  return rows.toSorted(
    (a, b) =>
      a.valuedAt.localeCompare(b.valuedAt) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}
export function latestPortfolioSnapshot(
  rows: readonly PortfolioSnapshot[],
  accountId: string,
  at?: string,
) {
  return (
    orderedSnapshots(
      rows.filter(
        (row) => row.accountId === accountId && (!at || row.valuedAt <= at),
      ),
    ).at(-1) ?? null
  );
}

/** Principal is opening equity plus net external transfer flow. Portfolio-to-portfolio transfers are deliberately neutral. */
export function investmentPrincipal(
  accountId: string,
  transactions: readonly AnalyticsTransaction[],
  accounts: readonly AnalyticsAccount[],
  at?: string,
) {
  const investmentIds = new Set(
    accounts
      .filter((a) => a.class === "asset" && a.subtype === "investment")
      .map((a) => a.id),
  );
  let principal = 0;
  for (const transaction of transactions) {
    if (transaction.status !== "posted" || (at && transaction.occurredAt > at))
      continue;
    const own = transaction.entries
      .filter((e) => e.accountId === accountId)
      .reduce((sum, e) => sum + e.amountMinor, 0);
    if (!own) continue;
    if (transaction.kind === "opening_balance") {
      principal += own;
      continue;
    }
    if (transaction.kind !== "transfer") continue;
    const hasOtherInvestment = transaction.entries.some(
      (e) => e.accountId !== accountId && investmentIds.has(e.accountId),
    );
    const hasExternalAsset = transaction.entries.some(
      (e) =>
        e.accountId !== accountId &&
        accounts.some(
          (a) =>
            a.id === e.accountId &&
            a.class === "asset" &&
            !investmentIds.has(a.id),
        ),
    );
    if (hasExternalAsset && !hasOtherInvestment) principal += own;
  }
  return Math.max(0, principal);
}

export function externalInvestmentFlows(
  accountId: string,
  transactions: readonly AnalyticsTransaction[],
  accounts: readonly AnalyticsAccount[],
) {
  const investmentIds = new Set(
    accounts
      .filter(
        (account) =>
          account.class === "asset" && account.subtype === "investment",
      )
      .map((account) => account.id),
  );
  return transactions.flatMap((transaction) => {
    if (transaction.status !== "posted" || transaction.kind !== "transfer")
      return [];
    const amountMinor = transaction.entries
      .filter((entry) => entry.accountId === accountId)
      .reduce((sum, entry) => sum + entry.amountMinor, 0);
    const hasOtherInvestment = transaction.entries.some(
      (entry) =>
        entry.accountId !== accountId && investmentIds.has(entry.accountId),
    );
    const hasExternalAsset = transaction.entries.some(
      (entry) =>
        entry.accountId !== accountId &&
        accounts.some(
          (account) =>
            account.id === entry.accountId &&
            account.class === "asset" &&
            !investmentIds.has(account.id),
        ),
    );
    return amountMinor && hasExternalAsset && !hasOtherInvestment
      ? [
          {
            id: transaction.id,
            date: transaction.occurredAt,
            description: transaction.description,
            amountMinor,
          },
        ]
      : [];
  });
}

export function buildInvestmentPositions(
  accounts: readonly AnalyticsAccount[],
  balances: ReadonlyMap<string, number>,
  transactions: readonly AnalyticsTransaction[],
  snapshots: readonly PortfolioSnapshot[],
): InvestmentPosition[] {
  return accounts
    .filter(
      (a) => !a.isSystem && a.class === "asset" && a.subtype === "investment",
    )
    .map((account) => {
      const book = balances.get(account.id) ?? 0,
        latest = latestPortfolioSnapshot(snapshots, account.id),
        market = latest?.valueMinor ?? book,
        principal = investmentPrincipal(account.id, transactions, accounts);
      return {
        accountId: account.id,
        name: account.name,
        bookValueMinor: book,
        marketValueMinor: market,
        principalMinor: principal,
        gainMinor: market - principal,
        gainRate: principal > 0 ? (market - principal) / principal : null,
        valuationAdjustmentMinor: market - book,
        latestSnapshot: latest,
      };
    });
}

export function portfolioTotals(positions: readonly InvestmentPosition[]) {
  return positions.reduce(
    (sum, row) => ({
      bookValueMinor: sum.bookValueMinor + row.bookValueMinor,
      marketValueMinor: sum.marketValueMinor + row.marketValueMinor,
      principalMinor: sum.principalMinor + row.principalMinor,
      gainMinor: sum.gainMinor + row.gainMinor,
      valuationAdjustmentMinor:
        sum.valuationAdjustmentMinor + row.valuationAdjustmentMinor,
    }),
    {
      bookValueMinor: 0,
      marketValueMinor: 0,
      principalMinor: 0,
      gainMinor: 0,
      valuationAdjustmentMinor: 0,
    },
  );
}

/** A snapshot replaces book value at its timestamp. Its valuation adjustment then carries forward until the next snapshot. */
export function applyPortfolioValuationsToNetWorth(
  points: readonly NetWorthPoint[],
  transactions: readonly AnalyticsTransaction[],
  accounts: readonly AnalyticsAccount[],
  snapshots: readonly PortfolioSnapshot[],
  _timeZone: string,
): NetWorthPoint[] {
  const investmentAccounts = accounts.filter(
    (a) => a.class === "asset" && a.subtype === "investment" && !a.isSystem,
  );
  return points.map((point) => {
    let adjustment = 0;
    for (const account of investmentAccounts) {
      const latest = latestPortfolioSnapshot(
        snapshots,
        account.id,
        `${point.date}T23:59:59.999Z`,
      );
      if (!latest) continue;
      let bookAtSnapshot = 0;
      for (const transaction of transactions)
        if (
          transaction.status === "posted" &&
          transaction.occurredAt <= latest.valuedAt
        )
          for (const entry of transaction.entries)
            if (entry.accountId === account.id)
              bookAtSnapshot += entry.amountMinor;
      adjustment += latest.valueMinor - bookAtSnapshot;
    }
    return { ...point, netWorthMinor: point.netWorthMinor + adjustment };
  });
}

export function investmentHistory(
  accountId: string,
  transactions: readonly AnalyticsTransaction[],
  accounts: readonly AnalyticsAccount[],
  snapshots: readonly PortfolioSnapshot[],
) {
  const rows = orderedSnapshots(
    snapshots.filter((s) => s.accountId === accountId),
  ).map((snapshot) => {
    const principal = investmentPrincipal(
      accountId,
      transactions,
      accounts,
      snapshot.valuedAt,
    );
    return {
      date: snapshot.valuedAt.slice(0, 10),
      valuedAt: snapshot.valuedAt,
      valueMinor: snapshot.valueMinor,
      principalMinor: principal,
      gainMinor: snapshot.valueMinor - principal,
      snapshotId: snapshot.id,
    };
  });
  return [...new Map(rows.map((row) => [row.date, row])).values()];
}
