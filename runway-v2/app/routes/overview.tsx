import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Page } from "~/components/page";
import { analyticsRepository } from "~/data/repositories/analytics-repository";
import { asMinorUnits, formatMinorUnits } from "~/domain/money";
import { buildOverviewReadModel } from "~/read-models/overview";

const projectionStorageKey = "runway:overview-projection-date:v1";
function money(value: number, currency: string) { return formatMinorUnits(asMinorUnits(Math.trunc(value)), currency); }
function initialProjectionDate() {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(projectionStorageKey);
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
  }
  const date = new Date(); date.setUTCDate(date.getUTCDate() + 30); return date.toISOString().slice(0, 10);
}

export default function OverviewRoute() {
  const [projectionDate, setProjectionDate] = useState(initialProjectionDate);
  const workspace = useQuery({ queryKey: ["analytics-workspace"], queryFn: () => analyticsRepository.getWorkspace() });
  const model = useMemo(() => workspace.data ? buildOverviewReadModel(workspace.data, projectionDate) : null, [workspace.data, projectionDate]);
  useEffect(() => { window.localStorage.setItem(projectionStorageKey, projectionDate); }, [projectionDate]);

  if (workspace.isLoading) return <Page eyebrow="Today" title="Overview" description="Your money at a glance."><section className="cockpit-hero overview-skeleton" aria-label="Loading overview"><article/><div className="position-grid"><article/><article/><article/></div></section></Page>;
  if (!model) return <Page eyebrow="Today" title="Overview unavailable" description="Your current figures could not be loaded. Please try again."/>;

  const c = model.currency, flow = model.currentFlow;
  return <Page eyebrow="Today" title="Overview" description="Your current balance, where it is allocated, and what is coming next.">
    <section className="cockpit-hero runway-position" aria-label="Current financial position">
      <article className="safe-card cash-card"><p className="section-kicker">Total current balance</p><strong>{money(model.position.totalCashMinor, c)}</strong><p>All liquid cash you have right now.</p><small>Planned income is included only after you mark it received.</small></article>
      <div className="position-grid overview-metrics">
        <article><span>Allocated to funds</span><strong>{money(model.position.allocatedCashMinor, c)}</strong><small>Part of your current balance</small></article>
        <article><span>Net worth</span><strong>{money(model.position.netWorthMinor, c)}</strong><small>Assets minus debts</small></article>
        <article className="projection-card"><label htmlFor="overview-projection-date">Projected balance</label><strong>{money(model.projection.liquidCashMinor, c)}</strong><input id="overview-projection-date" type="date" min={model.projection.minDate} max={model.projection.maxDate} value={model.projection.date} onChange={(event) => setProjectionDate(event.target.value)}/><small>Includes planned money through this date</small></article>
      </div>
    </section>

    <div className="overview-two overview-primary-grid">
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Funds</p><h2>Money set aside</h2></div><Link to="/funds">Manage funds →</Link></div><div className="overview-funds">{model.funds.map((fund) => <article key={fund.id}><div><strong>{fund.name}</strong><span>{money(fund.balanceMinor, c)}{fund.targetMinor != null ? ` of ${money(fund.targetMinor, c)}` : ""}</span></div>{fund.progress != null ? <div className="progress-track" aria-label={`${fund.name} ${Math.round(fund.progress * 100)}% complete`}><span style={{ width: `${fund.progress * 100}%` }}/></div> : null}</article>)}</div>{!model.funds.length ? <p className="muted">No funds yet.</p> : null}</section>
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Actual this month · {flow.month}</p><h2>Monthly cash flow</h2></div><Link to="/money/transactions">Record activity →</Link></div><dl className="metric-list"><div><dt>Income received</dt><dd className="positive">{money(flow.incomeMinor, c)}</dd></div><div><dt>Expenses paid</dt><dd>{money(flow.expenseMinor, c)}</dd></div><div><dt>Left after expenses</dt><dd>{money(flow.netMinor, c)}</dd></div></dl><p className="muted">Calculated from completed income and expenses. Opening balances, transfers and fund allocations are excluded.</p></section>
    </div>

    <section className="money-panel upcoming-panel"><div className="panel-heading"><div><p className="section-kicker">Next 30 days</p><h2>Upcoming</h2></div><Link to="/forecast">Open forecast →</Link></div><ul className="overview-list">{model.upcoming.map((row) => <li key={row.id}><time>{row.date}</time><span><strong>{row.label}</strong></span><b className={row.kind === "income" ? "positive" : row.kind === "expense" ? "negative" : ""}>{row.kind === "income" ? "+" : row.kind === "expense" ? "−" : "↔"}{money(row.amountMinor, c)}</b></li>)}</ul>{!model.upcoming.length ? <p className="muted">Nothing planned in the next 30 days.</p> : null}{model.overdue.length ? <p className="attention-note">{model.overdue.length} overdue item{model.overdue.length === 1 ? "" : "s"} need your attention in Forecast.</p> : null}</section>
  </Page>;
}
