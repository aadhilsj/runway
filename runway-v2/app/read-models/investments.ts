import type { investmentsRepository } from "~/data/repositories/investments-repository";
import type {
  AnalyticsAccount,
  AnalyticsTransaction,
} from "~/domain/analytics";
import {
  buildInvestmentPositions,
  externalInvestmentFlows,
  investmentHistory,
  portfolioTotals,
  type PortfolioSnapshot,
} from "~/domain/investments";
export type InvestmentWorkspace = Awaited<
  ReturnType<typeof investmentsRepository.getWorkspace>
>;
export function buildInvestmentsReadModel(workspace: InvestmentWorkspace) {
  const allAccounts: AnalyticsAccount[] = workspace.accounts.map(
    (row: any) => ({
      id: row.id,
      name: row.name,
      class: row.class,
      subtype: row.subtype,
      liquidityClass: row.liquidity_class,
      includeInNetWorth: row.include_in_net_worth,
      isSystem: row.is_system,
    }),
  );
  const transactions: AnalyticsTransaction[] = workspace.transactions.map(
    (row: any) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      occurredAt: row.occurred_at,
      description: row.description,
      reversesTransactionId: row.reverses_transaction_id,
      entries: row.transaction_entries.map((entry: any) => ({
        accountId: entry.account_id,
        amountMinor: Number(entry.amount_minor),
        categoryId: entry.category_id,
      })),
    }),
  );
  const snapshots: PortfolioSnapshot[] = workspace.snapshots.map(
      (row: any) => ({
        id: row.id,
        accountId: row.account_id,
        valueMinor: Number(row.value_minor),
        valuedAt: row.valued_at,
        createdAt: row.created_at,
        notes: row.notes,
      }),
    ),
    balances = new Map<string, number>(
      workspace.balances.map((row: any) => [
        row.account_id,
        Number(row.display_balance_minor ?? 0),
      ]),
    );
  const positions = buildInvestmentPositions(
    allAccounts,
    balances,
    transactions,
    snapshots,
  );
  return {
    currency: workspace.profile.base_currency,
    positions,
    totals: portfolioTotals(positions),
    snapshots,
    transactions,
    accounts: allAccounts,
    history: (id: string) =>
      investmentHistory(id, transactions, allAccounts, snapshots),
    contributions: (id: string) =>
      externalInvestmentFlows(id, transactions, allAccounts),
  };
}
