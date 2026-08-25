import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Page } from "~/components/page";
import { analyticsRepository } from "~/data/repositories/analytics-repository";
import { asMinorUnits, formatMinorAxis, formatMinorUnits } from "~/domain/money";
import { buildAnalyticsReadModel } from "~/read-models/overview";
function money(v: number, c: string) {
  return formatMinorUnits(asMinorUnits(Math.trunc(v)), c);
}
function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
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
  const selectedMonth = month || model.currentMonth;
  const selectedCashFlow = model.cashFlow.find(
    (row) => row.month === selectedMonth,
  ) ?? { month: selectedMonth, incomeMinor: 0, expenseMinor: 0, netMinor: 0 };
  return (
    <Page
      eyebrow="Your money over time"
      title="Analytics"
      description="Review actual cash flow, category spending, and budget performance month by month. Future money stays in Forecast."
    >
      <div className="analytics-controls">
        <label htmlFor="analytics-month">
          Month
          <select
            id="analytics-month"
            value={selectedMonth}
            onChange={(e) => setMonth(e.target.value)}
          >
            {months.map((value) => (
              <option key={value} value={value}>{monthLabel(value)}</option>
            ))}
          </select>
        </label>
      </div>
      <section className="analytics-grid">
        <article className="chart-card">
          <div>
            <p className="section-kicker">Actual · transfers excluded</p>
            <h2>Monthly cash flow</h2>
            <p className="muted">{monthLabel(selectedMonth)}</p>
          </div>
          <dl className="analytics-metrics">
            <div><dt>Income</dt><dd className="positive">{money(selectedCashFlow.incomeMinor, model.currency)}</dd></div>
            <div><dt>Expenses</dt><dd className="negative">{money(selectedCashFlow.expenseMinor, model.currency)}</dd></div>
            <div><dt>Net</dt><dd className={selectedCashFlow.netMinor < 0 ? "negative" : selectedCashFlow.netMinor > 0 ? "positive" : ""}>{money(selectedCashFlow.netMinor, model.currency)}</dd></div>
          </dl>
          {selectedCashFlow.incomeMinor === 0 && selectedCashFlow.expenseMinor === 0 ? <p className="muted">No posted income or expenses in this month.</p> : null}
        </article>
        <article className="chart-card">
          <div>
            <p className="section-kicker">Actual · selected month</p>
            <h2>Spending by category</h2>
            <p className="analytics-card-help">Categories come from Activity. Transactions recorded without one appear as Unclassified.</p>
          </div>
          {model.spending.length ? <div className="analytics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.spending} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatMinorAxis(Number(v))}
                />
                <YAxis type="category" dataKey="label" width={100} />
                <Tooltip formatter={(v) => money(Number(v), model.currency)} />
                <Bar dataKey="amountMinor" name="Spending" fill="#bb5f43" />
              </BarChart>
            </ResponsiveContainer>
          </div> : <div className="chart-empty"><span>No category spending yet</span><small>Only posted expenses are included.</small></div>}
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
        <article className="chart-card budget-performance-card">
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
                  </tr>
                </thead>
                <tbody>
                  {budget.rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{money(row.budgetedMinor, model.currency)}</td>
                      <td>{money(row.actualMinor, model.currency)}</td>
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
