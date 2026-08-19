import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Page } from "~/components/page";
import { analyticsRepository } from "~/data/repositories/analytics-repository";
import { asMinorUnits, formatMinorUnits } from "~/domain/money";
import { buildAnalyticsReadModel } from "~/read-models/overview";
function money(v: number, c: string) {
  return formatMinorUnits(asMinorUnits(Math.trunc(v)), c);
}
export default function AnalyticsRoute() {
  const workspace = useQuery({
      queryKey: ["analytics-workspace"],
      queryFn: () => analyticsRepository.getWorkspace(),
    }),
    [month, setMonth] = useState("");
  const model = useMemo(
    () =>
      workspace.data
        ? buildAnalyticsReadModel(workspace.data, month || undefined)
        : null,
    [workspace.data, month],
  );
  if (!model)
    return (
      <Page
        eyebrow="Authoritative trends"
        title="Analytics"
        description="Loading ledger-derived analytics…"
      />
    );
  const months = [
    ...new Set([
      ...model.cashFlow.map((row) => row.month),
      ...model.budgetPeriods.map((row) => row.month),
      model.currentMonth,
    ]),
  ].sort();
  const budget = model.budgetPeriods.find(
    (row) => row.month === (month || model.currentMonth),
  );
  return (
    <Page
      eyebrow="Authoritative trends"
      title="Analytics"
      description="Actual history is ledger-derived from Runway 2 cutover. Projected money remains visibly separate in Forecast."
    >
      <div className="analytics-toolbar">
        <label>
          Selected month
          <select
            value={month || model.currentMonth}
            onChange={(e) => setMonth(e.target.value)}
          >
            {months.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <span>
          Authoritative history begins{" "}
          {model.cutoverDate ?? "when the first actual transaction is posted"}.
        </span>
      </div>
      <section className="analytics-grid">
        <article className="chart-card">
          <div>
            <p className="section-kicker">Actual · transfers excluded</p>
            <h2>Monthly cash flow</h2>
          </div>
          <div className="analytics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.cashFlow}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip formatter={(v) => money(Number(v), model.currency)} />
                <Legend />
                <Bar dataKey="incomeMinor" name="Income" fill="#3e7356" />
                <Bar dataKey="expenseMinor" name="Expenses" fill="#bb5f43" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {model.cashFlow.map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>{money(row.incomeMinor, model.currency)}</td>
                  <td>{money(row.expenseMinor, model.currency)}</td>
                  <td>{money(row.netMinor, model.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!model.cashFlow.length ? (
            <p className="muted">No posted income or expenses yet.</p>
          ) : null}
        </article>
        <article className="chart-card">
          <div>
            <p className="section-kicker">Actual · selected month</p>
            <h2>Spending by category</h2>
          </div>
          <div className="analytics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.spending} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <YAxis type="category" dataKey="label" width={100} />
                <Tooltip formatter={(v) => money(Number(v), model.currency)} />
                <Bar dataKey="amountMinor" name="Spending" fill="#bb5f43" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="ranked-list">
            {model.spending.map((row) => (
              <li key={row.categoryId ?? "none"}>
                <span>
                  {row.label}
                  <small>{Math.round(row.share * 100)}% of spending</small>
                </span>
                <strong>{money(row.amountMinor, model.currency)}</strong>
              </li>
            ))}
          </ul>
          {!model.spending.length ? (
            <p className="muted">
              No spending in this period. Comparisons appear only when periods
              contain comparable data.
            </p>
          ) : null}
        </article>
        <article className="chart-card">
          <div>
            <p className="section-kicker">Actual · ledger-derived</p>
            <h2>Net worth since cutover</h2>
          </div>
          <div className="analytics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={model.netWorth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  formatter={(v) => [
                    money(Number(v), model.currency),
                    "Authoritative net worth",
                  ]}
                />
                <Line
                  type="stepAfter"
                  dataKey="netWorthMinor"
                  name="Net worth"
                  stroke="#24352f"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="muted">
            Recorded portfolio values replace book value from their observation
            date and carry forward until the next snapshot. No pre-cutover
            values or unrecorded market gains are inferred.
          </p>
        </article>
        <article className="chart-card">
          <div>
            <p className="section-kicker">Recorded budget periods only</p>
            <h2>Budget performance</h2>
          </div>
          {budget ? (
            <>
              <div className="budget-overview">
                <span>
                  Budget{" "}
                  <strong>
                    {money(budget.totals.budgetedMinor, model.currency)}
                  </strong>
                </span>
                <span>
                  Actual{" "}
                  <strong>
                    {money(budget.totals.actualMinor, model.currency)}
                  </strong>
                </span>
                <span>
                  Variance{" "}
                  <strong>
                    {money(budget.totals.remainingMinor, model.currency)}
                  </strong>
                </span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Budget</th>
                    <th>Actual</th>
                    <th>Committed</th>
                  </tr>
                </thead>
                <tbody>
                  {budget.rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{money(row.budgetedMinor, model.currency)}</td>
                      <td>{money(row.actualMinor, model.currency)}</td>
                      <td>{money(row.committedMinor, model.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">
              No budget exists for this month. Months are never synthesized.
            </p>
          )}
        </article>
      </section>
    </Page>
  );
}
