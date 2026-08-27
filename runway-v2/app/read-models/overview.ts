import type { analyticsRepository } from "~/data/repositories/analytics-repository";
import {
  aggregateCategorySpend,
  aggregateMonthlyCashFlow,
  currentFinancialPosition,
  deriveNetWorthSeries,
  type AnalyticsAccount,
  type AnalyticsTransaction,
} from "~/domain/analytics";
import { calculateBudgetLine } from "~/domain/budgets";
import {
  applyPortfolioValuationsToNetWorth,
  type PortfolioSnapshot,
} from "~/domain/investments";
import { buildSelectedPlansEvaluation } from "./plans";

export type AnalyticsWorkspace = Awaited<
  ReturnType<typeof analyticsRepository.getWorkspace>
>;
function toInputs(workspace: AnalyticsWorkspace) {
  const accounts: AnalyticsAccount[] = workspace.forecast.accounts.map(
    (row) => ({
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
    (row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      occurredAt: row.occurred_at,
      description: row.description,
      reversesTransactionId: row.reverses_transaction_id,
      entries: row.transaction_entries.map((entry) => ({
        accountId: entry.account_id,
        amountMinor: Number(entry.amount_minor),
        categoryId: entry.category_id,
      })),
    }),
  );
  const snapshots: PortfolioSnapshot[] = (
    workspace.forecast.portfolioSnapshots ?? []
  ).map((row) => ({
    id: row.id,
    accountId: row.account_id,
    valueMinor: Number(row.value_minor),
    valuedAt: row.valued_at,
    createdAt: row.created_at,
    notes: null,
  }));
  return { accounts, transactions, snapshots };
}
export function monthInTimezone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}
export function buildAnalyticsReadModel(
  workspace: AnalyticsWorkspace,
  selectedMonth?: string,
) {
  const { accounts, transactions, snapshots } = toInputs(workspace),
    timeZone = workspace.forecast.profile.timezone,
    currentMonth = selectedMonth ?? monthInTimezone(timeZone),
    categories = new Map(
      workspace.forecast.categories.map((row) => [row.id, row.name]),
    );
  const cashFlow = aggregateMonthlyCashFlow(transactions, accounts, timeZone),
    spending = aggregateCategorySpend(
      transactions,
      accounts,
      categories,
      timeZone,
      currentMonth,
    ),
    netWorth = applyPortfolioValuationsToNetWorth(
      deriveNetWorthSeries(transactions, accounts, timeZone),
      transactions,
      accounts,
      snapshots,
      timeZone,
    );
  const budgetPeriods = workspace.budgets.periods.map((period) => {
    const rows = workspace.budgets.lines
      .filter((line) => line.budget_period_id === period.id)
      .map((line) => {
        const categoryIds = line.category_id
          ? [line.category_id]
          : workspace.budgets.groupCategories
              .filter((row) => row.group_id === line.group_id)
              .map((row) => row.category_id);
        const actual = workspace.budgets.actuals
            .filter(
              (row) =>
                row.month_start === period.month_start &&
                categoryIds.includes(row.category_id),
            )
            .reduce((sum, row) => sum + Number(row.actual_minor), 0);
        return {
          label: line.category_id
            ? (categories.get(line.category_id) ?? "Budget line")
            : (workspace.budgets.groups.find((row) => row.id === line.group_id)
                ?.name ?? "Budget group"),
          ...calculateBudgetLine({
            budgetedMinor: Number(line.budgeted_minor),
            expenseMinor: actual,
          }),
        };
      });
    return {
      month: period.month_start.slice(0, 7),
      rows,
      totals: rows.reduce(
        (sum, row) => ({
          budgetedMinor: sum.budgetedMinor + row.budgetedMinor,
          actualMinor: sum.actualMinor + row.actualMinor,
          remainingMinor: sum.remainingMinor + row.remainingMinor,
        }),
        {
          budgetedMinor: 0,
          actualMinor: 0,
          remainingMinor: 0,
        },
      ),
    };
  });
  return {
    currency: workspace.forecast.profile.base_currency,
    timeZone,
    currentMonth,
    cashFlow,
    spending,
    netWorth,
    budgetPeriods,
    cutoverDate: netWorth[0]?.date ?? null,
  };
}
export function buildOverviewReadModel(
  workspace: AnalyticsWorkspace,
  projectionDate?: string,
) {
  const analytics = buildAnalyticsReadModel(workspace),
    balances = new Map(
      workspace.forecast.balances.map((row) => [
        row.account_id,
        Number(row.display_balance_minor ?? 0),
      ]),
    ),
    allocated = workspace.funds.balances.reduce(
      (sum, row) => sum + Number(row.balance_minor),
      0,
    ),
    position = currentFinancialPosition(
      toInputs(workspace).accounts,
      balances,
      allocated,
    );
  const selectedPlanIds = workspace.plans
      .filter(
        (row) =>
          row.comparison_enabled &&
          (row.status === "active" || row.status === "draft"),
      )
      .map((row) => row.id),
    active = buildSelectedPlansEvaluation(workspace, selectedPlanIds),
    currentFlow = analytics.cashFlow.find(
      (row) => row.month === analytics.currentMonth,
    ) ?? {
      month: analytics.currentMonth,
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
    },
    currentBudget =
      analytics.budgetPeriods.find(
        (row) => row.month === analytics.currentMonth,
      ) ??
      analytics.budgetPeriods.at(-1) ??
      null,
    ruleReliability = new Map(
      workspace.forecast.rules.map((row) => [row.id, row.is_reliable_income]),
    );
  const upcoming = active.result.events
      .filter(
        (row) =>
          row.date >= active.result.asOfDate &&
          row.date <= shift(active.result.asOfDate, 30) &&
          row.confidence !== "tentative",
      )
      .slice(0, 8),
    nextReliableIncome = active.result.events.find(
      (row) =>
        row.kind === "income" &&
        row.recurrenceRuleId &&
        ruleReliability.get(row.recurrenceRuleId),
    ),
    fundEnd = active.result.fundSeries.at(-1)?.balancesMinor ?? {},
    requestedProjectionDate = projectionDate ?? shift(active.result.asOfDate, 30),
    projectionPoint = active.result.dailySeries.find((point) => point.date === requestedProjectionDate)
      ?? active.result.dailySeries.findLast((point) => point.date <= requestedProjectionDate)
      ?? active.result.dailySeries[0];
  const funds = workspace.funds.funds
      .filter((row) => row.active)
      .map((fund) => {
        const balance = Number(
            workspace.funds.balances.find((row) => row.fund_id === fund.id)
              ?.balance_minor ?? 0,
          ),
          goal = workspace.funds.goals.find(
            (row) => row.fund_id === fund.id && row.status === "active",
          ),
          threshold =
            goal?.target_minor ??
            goal?.preferred_balance_minor ??
            goal?.cap_minor ??
            null,
          item = workspace.funds.items.find(
            (row) => row.destination_fund_id === fund.id && row.active,
          );
        return {
          id: fund.id,
          name: fund.name,
          balanceMinor: balance,
          targetMinor: threshold == null ? null : Number(threshold),
          progress: threshold
            ? Math.max(0, Math.min(1, balance / Number(threshold)))
            : null,
          projectedBalanceMinor: Number(fundEnd[fund.id] ?? balance),
          projectedCompletion: goal
            ? (active.goalCompletionDates[goal.id] ?? null)
            : null,
          contributionMode: item?.mode ?? null,
          nextContributionMinor: item ? Number(item.amount_minor) : null,
        };
      }),
    recent = workspace.transactions
      .toReversed()
      .slice(0, 6)
      .map((row) => {
        const visible = row.transaction_entries.filter((entry) =>
            workspace.forecast.accounts.some(
              (account) =>
                account.id === entry.account_id && !account.is_system && !account.hidden_from_accounts,
            ),
          ),
          primary =
            visible.find((entry) => Number(entry.amount_minor) < 0) ??
            visible[0];
        return {
          id: row.id,
          date: row.occurred_at,
          description: row.description,
          kind: row.kind,
          amountMinor: Math.abs(Number(primary?.amount_minor ?? 0)),
          isReversal: Boolean(row.reverses_transaction_id),
        };
      });
  return {
    analytics,
    position,
    safeToSpendMinor: active.safeToSpendMinor,
    safeToSpendTrace: active.safeToSpendTrace,
    operatingFloorMinor: active.applied.forecast.operatingFloorMinor,
    safetyWindowDays: active.applied.safetyWindowDays,
    nextReliableIncome,
    projection: {
      date: projectionPoint?.date ?? active.result.asOfDate,
      liquidCashMinor: projectionPoint?.liquidCashMinor ?? position.totalCashMinor,
      minDate: active.result.asOfDate,
      maxDate: active.result.endDate,
    },
    forecast: {
      endDate: active.result.endDate,
      endingOperatingCashMinor: active.result.endingOperatingCashMinor,
      lowest: active.result.lowestOperatingCash,
      firstBreach: active.result.firstFloorBreach,
      incomeMinor: active.result.totals.incomeMinor,
      expenseMinor: active.result.totals.expenseMinor,
      chart: active.result.dailySeries.filter((_, index) => index % 7 === 0),
    },
    funds,
    currentFlow,
    currentBudget,
    upcoming,
    overdue: active.result.overdueItems,
    recent,
    selectedPlanIds,
    planAlternative: null,
    currency: analytics.currency,
  };
}
function shift(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
