import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
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
  const cashFlowChart = [
    { label: "Income", amountMinor: selectedCashFlow.incomeMinor, color: "#3e7356" },
    { label: "Expenses", amountMinor: selectedCashFlow.expenseMinor, color: "#bb5f43" },
    { label: "Net", amountMinor: selectedCashFlow.netMinor, color: selectedCashFlow.netMinor < 0 ? "#bb5f43" : "#6b9278" },
  ];
  const categoryChart = model.spending.length > 5
    ? [
        ...model.spending.slice(0, 4),
        {
          categoryId: "other",
          label: "Other",
          amountMinor: model.spending.slice(4).reduce((sum, row) => sum + row.amountMinor, 0),
          share: model.spending.slice(4).reduce((sum, row) => sum + row.share, 0),
        },
      ]
    : model.spending;
  return (
    <Page
      eyebrow="Your money over time"
      title="Analytics"
      description="Review actual cash flow, category spending, and budget performance month by month. Future money stays in Forecast."
      className="analytics-page"
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
        <article className="chart-card analytics-card cash-flow-card">
          <div>
            <p className="section-kicker">Actual · transfers excluded</p>
            <h2>Monthly cash flow</h2>
          </div>
          {selectedCashFlow.incomeMinor !== 0 || selectedCashFlow.expenseMinor !== 0 ? <div className="analytics-chart analytics-cash-chart" role="img" aria-label={`Monthly cash flow chart for ${monthLabel(selectedMonth)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashFlowChart} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis width={52} axisLine={false} tickLine={false} tickFormatter={(value) => formatMinorAxis(Number(value))} />
                <Tooltip formatter={(value) => money(Number(value), model.currency)} />
                <ReferenceLine y={0} stroke="#8d7f72" />
                <Bar dataKey="amountMinor" radius={[5, 5, 0, 0]}>
                  {cashFlowChart.map((row) => <Cell key={row.label} fill={row.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div> : <div className="chart-empty compact-chart-empty"><span>No cash flow yet</span><small>Posted income and expenses will appear here.</small></div>}
        </article>
        <article className="chart-card analytics-card category-card">
          <div>
            <p className="section-kicker">Actual · selected month</p>
            <h2>Spending by category</h2>
          </div>
          {categoryChart.length ? <div className="analytics-chart analytics-category-chart" role="img" aria-label={`Spending by category chart for ${monthLabel(selectedMonth)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChart} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatMinorAxis(Number(v))}
                />
                <YAxis type="category" dataKey="label" width={88} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => money(Number(v), model.currency)} />
                <Bar dataKey="amountMinor" name="Spending" fill="#bb5f43" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div> : <div className="chart-empty compact-chart-empty"><span>No category spending yet</span><small>Only posted expenses are included.</small></div>}
          <p className="analytics-card-help">Categories come from Activity. Missing categories appear as Unclassified.</p>
        </article>
        <article className="chart-card analytics-card budget-performance-card">
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
              <div className="analytics-budget-table"><table>
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
              </table></div>
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
