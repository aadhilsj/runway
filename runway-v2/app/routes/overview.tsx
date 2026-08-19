import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Page } from "~/components/page";
import { analyticsRepository } from "~/data/repositories/analytics-repository";
import { asMinorUnits, formatMinorUnits } from "~/domain/money";
import { buildOverviewReadModel } from "~/read-models/overview";
function money(value: number, currency: string) {
  return formatMinorUnits(asMinorUnits(Math.trunc(value)), currency);
}
export default function OverviewRoute() {
  const workspace = useQuery({
      queryKey: ["analytics-workspace"],
      queryFn: () => analyticsRepository.getWorkspace(),
    }),
    model = useMemo(
      () => (workspace.data ? buildOverviewReadModel(workspace.data) : null),
      [workspace.data],
    );
  if (workspace.isLoading)
    return (
      <Page
        eyebrow="Financial cockpit"
        title="Overview"
        description="Bringing actual balances, forecast, Funds, budgets and Plans together…"
      />
    );
  if (!model)
    return (
      <Page
        eyebrow="Financial cockpit"
        title="Overview unavailable"
        description="The financial read model could not be loaded."
      />
    );
  const c = model.currency,
    flow = model.currentFlow,
    budget = model.currentBudget;
  return (
    <Page
      eyebrow="Financial cockpit"
      title="Overview"
      description="Actual money, planned obligations, and the decisions that shape your runway—kept in their proper lanes."
    >
      <section className="cockpit-hero">
        <article className="safe-card">
          <p className="section-kicker">Safe to spend</p>
          <strong>{money(model.safeToSpendMinor, c)}</strong>
          <p>
            Projected operating cash inside your {model.safetyWindowDays}-day
            safety window after preserving a{" "}
            {money(model.operatingFloorMinor, c)} floor.
          </p>
          {model.nextReliableIncome ? (
            <small>
              Next reliable income: {model.nextReliableIncome.date} ·{" "}
              {money(model.nextReliableIncome.amountMinor, c)}
            </small>
          ) : (
            <small>No reliable income is configured inside this horizon.</small>
          )}
        </article>
        <div className="position-grid">
          <article>
            <span>Total cash</span>
            <strong>{money(model.position.totalCashMinor, c)}</strong>
          </article>
          <article>
            <span>Allocated</span>
            <strong>{money(model.position.allocatedCashMinor, c)}</strong>
          </article>
          <article>
            <span>Unallocated</span>
            <strong>{money(model.position.unallocatedCashMinor, c)}</strong>
          </article>
          <article>
            <span>Net worth</span>
            <strong>{money(model.position.netWorthMinor, c)}</strong>
            <small>
              Investments (latest value):{" "}
              {money(model.position.investmentBookValueMinor, c)}
            </small>
          </article>
        </div>
      </section>
      <section className="chart-card overview-forecast">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Projected · Base Plan</p>
            <h2>Operating cash through {model.forecast.endDate}</h2>
          </div>
          <Link to="/forecast">View full forecast →</Link>
        </div>
        <div className="overview-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={model.forecast.chart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" minTickGap={45} />
              <YAxis
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
              />
              <Tooltip
                formatter={(v) => [
                  money(Number(v), c),
                  "Projected operating cash",
                ]}
              />
              <ReferenceLine
                y={model.operatingFloorMinor}
                stroke="#bb5f43"
                strokeDasharray="6 4"
                label="Floor"
              />
              <Area
                type="monotone"
                dataKey="operatingCashMinor"
                stroke="#3e7356"
                strokeDasharray="5 3"
                fill="rgba(62,115,86,.12)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="forecast-mini">
          <span>
            Ending{" "}
            <strong>{money(model.forecast.endingOperatingCashMinor, c)}</strong>
          </span>
          <span>
            Lowest{" "}
            <strong>{money(model.forecast.lowest.balanceMinor, c)}</strong> on{" "}
            {model.forecast.lowest.date}
          </span>
          <span>
            {model.forecast.firstBreach
              ? `First floor breach ${model.forecast.firstBreach.date}`
              : "No operating-floor breach projected"}
          </span>
        </div>
      </section>
      <div className="overview-two">
        <section className="money-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Funds + Goals</p>
              <h2>Allocated purpose</h2>
            </div>
            <Link to="/funds">All Funds →</Link>
          </div>
          <div className="overview-funds">
            {model.funds.map((fund) => (
              <article key={fund.id}>
                <div>
                  <strong>{fund.name}</strong>
                  <span>
                    {money(fund.balanceMinor, c)}
                    {fund.targetMinor != null
                      ? ` / ${money(fund.targetMinor, c)}`
                      : ""}
                  </span>
                </div>
                {fund.progress != null ? (
                  <div className="progress-track">
                    <span style={{ width: `${fund.progress * 100}%` }} />
                  </div>
                ) : null}
                <small>
                  {fund.projectedCompletion
                    ? `Projected target ${fund.projectedCompletion}`
                    : "Not reached in selected horizon"}
                  {fund.contributionMode ? ` · ${fund.contributionMode}` : ""}
                </small>
              </article>
            ))}
          </div>
        </section>
        <section className="money-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Actual · {flow.month}</p>
              <h2>Monthly cash flow</h2>
            </div>
            <Link to="/analytics">Open analytics →</Link>
          </div>
          <dl className="metric-list">
            <div>
              <dt>Income</dt>
              <dd>{money(flow.incomeMinor, c)}</dd>
            </div>
            <div>
              <dt>Expenses</dt>
              <dd>{money(flow.expenseMinor, c)}</dd>
            </div>
            <div>
              <dt>Net cash flow</dt>
              <dd>{money(flow.netMinor, c)}</dd>
            </div>
          </dl>
          {flow.incomeMinor === 0 && flow.expenseMinor === 0 ? (
            <p className="muted">
              No posted income or spending yet this month. Opening balance and
              transfers are excluded.
            </p>
          ) : null}
        </section>
      </div>
      <div className="overview-two">
        <section className="money-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Budget</p>
              <h2>{budget?.month ?? "No active period"}</h2>
            </div>
            <Link to="/money/budgets">Budgets →</Link>
          </div>
          {budget ? (
            <>
              <div className="budget-overview">
                <span>
                  Budgeted{" "}
                  <strong>{money(budget.totals.budgetedMinor, c)}</strong>
                </span>
                <span>
                  Actual <strong>{money(budget.totals.actualMinor, c)}</strong>
                </span>
                <span>
                  Committed{" "}
                  <strong>{money(budget.totals.committedMinor, c)}</strong>
                </span>
                <span>
                  Uncommitted{" "}
                  <strong>{money(budget.totals.uncommittedMinor, c)}</strong>
                </span>
              </div>
              {budget.rows.slice(0, 4).map((row) => (
                <div className="mini-budget" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{Math.round(row.utilization * 100)}%</strong>
                </div>
              ))}
            </>
          ) : (
            <p className="muted">No budget periods exist yet.</p>
          )}
        </section>
        <section className="money-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Next 30 days</p>
              <h2>Upcoming obligations</h2>
            </div>
            <Link to="/forecast">Forecast →</Link>
          </div>
          <ul className="overview-list">
            {model.upcoming.map((row) => (
              <li key={row.id}>
                <time>{row.date}</time>
                <span>
                  <strong>{row.label}</strong>
                  <small>
                    {row.sourceType.replaceAll("_", " ")} · {row.confidence}
                  </small>
                </span>
                <b className={row.kind === "income" ? "positive" : "negative"}>
                  {row.kind === "income" ? "+" : "−"}
                  {money(row.amountMinor, c)}
                </b>
              </li>
            ))}
          </ul>
          {!model.upcoming.length ? (
            <p className="muted">
              No committed or expected items in the next 30 days.
            </p>
          ) : null}
          {model.overdue.length ? (
            <p className="attention-note">
              {model.overdue.length} overdue forecast item
              {model.overdue.length === 1 ? "" : "s"} need attention.
            </p>
          ) : null}
        </section>
      </div>
      <div className="overview-two">
        <section className="money-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Plans</p>
              <h2>
                {model.planAlternative
                  ? "Selected Plan impact"
                  : "No Plan selected"}
              </h2>
            </div>
            <Link to="/plans/compare">Compare →</Link>
          </div>
          {model.planAlternative ? (
            <dl className="metric-list">
              <div>
                <dt>{model.planAlternative.label}</dt>
                <dd>
                  {money(
                    model.planAlternative.deltas.endingOperatingCashMinor,
                    c,
                  )}{" "}
                  ending cash
                </dd>
              </div>
              <div>
                <dt>Lowest cash impact</dt>
                <dd>
                  {money(
                    model.planAlternative.deltas.lowestOperatingCashMinor,
                    c,
                  )}
                </dd>
              </div>
              <div>
                <dt>Floor breach change</dt>
                <dd>{model.planAlternative.deltas.floorBreachCount}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">
              Enable a Plan for comparison to see its impact here. Base remains
              unchanged.
            </p>
          )}
        </section>
        <section className="money-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Authoritative ledger</p>
              <h2>Recent activity</h2>
            </div>
            <Link to="/money/transactions">Transactions →</Link>
          </div>
          <ul className="overview-list">
            {model.recent.map((row) => (
              <li key={row.id}>
                <time>{row.date.slice(0, 10)}</time>
                <span>
                  <strong>{row.description}</strong>
                  <small>
                    {row.isReversal
                      ? "Correction"
                      : row.kind.replaceAll("_", " ")}
                  </small>
                </span>
                <b>{money(row.amountMinor, c)}</b>
              </li>
            ))}
          </ul>
          {!model.recent.length ? (
            <p className="muted">No authoritative transactions yet.</p>
          ) : null}
        </section>
      </div>
    </Page>
  );
}
