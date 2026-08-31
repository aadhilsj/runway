import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { analyticsRepository } from "~/data/repositories/analytics-repository";
import { accountsRepository } from "~/data/repositories/accounts-repository";
import { snapshotsRepository } from "~/data/repositories/snapshots-repository";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { buildOverviewReadModel } from "~/read-models/overview";
import { userFacingError } from "~/user-facing-error";

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
  const queryClient = useQueryClient();
  const [projectionDate, setProjectionDate] = useState(initialProjectionDate);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [confirmBalance, setConfirmBalance] = useState(false);
  const [startingBalance, setStartingBalance] = useState("");
  const workspace = useQuery({ queryKey: ["analytics-workspace"], queryFn: () => analyticsRepository.getWorkspace() });
  const model = useMemo(() => workspace.data ? buildOverviewReadModel(workspace.data, projectionDate) : null, [workspace.data, projectionDate]);
  const liquidAccounts = useMemo(() => workspace.data?.forecast.accounts.filter((account) => !account.is_system && !account.hidden_from_accounts && account.class === "asset" && (account.liquidity_class === "operating" || account.liquidity_class === "liquid")) ?? [], [workspace.data]);
  const primaryAccount = liquidAccounts.find((account) => account.liquidity_class === "operating") ?? liquidAccounts[0] ?? null;
  const primaryBalance = primaryAccount ? Number(workspace.data?.forecast.balances.find((row) => row.account_id === primaryAccount.id)?.display_balance_minor ?? 0) : 0;
  const targetTotalMinor = (() => { try { return balanceAmount ? Number(parseDisplayAmountToMinor(balanceAmount)) : null; } catch { return null; } })();
  const currentTotalMinor = model?.position.totalCashMinor ?? 0;
  const balanceDifference = targetTotalMinor == null ? null : targetTotalMinor - currentTotalMinor;
  const reconcile = useMutation({
    mutationFn: async () => {
      if (!primaryAccount || targetTotalMinor == null) throw new Error("No editable cash account is available.");
      const otherLiquidCash = currentTotalMinor - primaryBalance;
      return snapshotsRepository.reconcileAccount({ accountId: primaryAccount.id, observedBalanceMinor: targetTotalMinor - otherLiquidCash,
        observedAt: new Date().toISOString(), notes: "Overview total balance adjustment", createAdjustment: true,
        idempotencyKey: `overview-balance:${crypto.randomUUID()}` });
    },
    onSuccess: async () => {
      setBalanceOpen(false); setConfirmBalance(false);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["analytics-workspace"] }), queryClient.invalidateQueries({ queryKey: ["forecast-workspace"] }), queryClient.invalidateQueries({ queryKey: ["accounts"] }), queryClient.invalidateQueries({ queryKey: ["net-worth"] }), queryClient.invalidateQueries({ queryKey: ["transactions"] })]);
    },
  });
  const startUsingRunway = useMutation({
    mutationFn: async () => {
      const openingBalanceMinor = Number(parseDisplayAmountToMinor(startingBalance));
      return accountsRepository.createAccount({
        name: "Main account", class: "asset", subtype: "checking", currency: "NOK",
        includeInNetWorth: true, liquidityClass: "operating", valuationMode: "ledger",
        openedOn: new Date().toISOString().slice(0, 10), openingBalanceMinor,
        openingOccurredAt: new Date().toISOString(), openingDescription: "Starting balance",
        idempotencyKey: "first-account:" + crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["analytics-workspace"] }),
        queryClient.invalidateQueries({ queryKey: ["forecast-workspace"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["net-worth"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
  });
  useEffect(() => { window.localStorage.setItem(projectionStorageKey, projectionDate); }, [projectionDate]);

  if (workspace.isLoading) return <Page eyebrow="Today" title="Overview" description="Your money at a glance."><section className="cockpit-hero overview-skeleton" aria-label="Loading overview"><article/><div className="position-grid"><article/><article/><article/></div></section></Page>;
  if (!model) return <Page eyebrow="Today" title="Overview unavailable" description="Your current figures could not be loaded. Please try again."/>;
  if (!primaryAccount) return <Page eyebrow="Start here" title="Set up your balance" description="Enter the money currently in your main bank account to begin using Runway.">
    <section className="money-panel first-balance-panel">
      <p className="section-kicker">Your starting point</p>
      <h2>What is your current balance?</h2>
      <p className="muted">This creates your main account and saves the amount as a starting balance. It is not treated as income.</p>
      <form className="money-form" onSubmit={(event) => { event.preventDefault(); startUsingRunway.mutate(); }}>
        <label>Main account balance<input aria-label="Main account balance" value={startingBalance} onChange={(event) => setStartingBalance(event.target.value)} inputMode="decimal" placeholder="0.00" required autoFocus/></label>
        {startUsingRunway.error ? <p className="field-error" role="alert">{userFacingError(startUsingRunway.error, "Your account could not be created. Please try again.")}</p> : null}
        <button className="primary-button" type="submit" disabled={startUsingRunway.isPending}>{startUsingRunway.isPending ? "Saving your balance…" : "Start with this balance"}</button>
      </form>
    </section>
  </Page>;

  const c = model.currency, flow = model.currentFlow;
  return <Page eyebrow="Today" title="Overview" description="Your current balance, where it is allocated, and what is coming next.">
    <section className="cockpit-hero runway-position" aria-label="Current financial position">
      <article className="safe-card cash-card"><p className="section-kicker">Total current balance</p><button className="editable-balance" type="button" disabled={!primaryAccount} aria-label="Edit total current balance" onClick={() => { setBalanceAmount((model.position.totalCashMinor / 100).toFixed(2)); setConfirmBalance(false); setBalanceOpen(true); }}><strong>{money(model.position.totalCashMinor, c)}</strong><span aria-hidden="true">Edit</span></button><p>All liquid cash you have right now.</p></article>
      <div className="position-grid overview-metrics">
        <article><span>Allocated to funds</span><strong>{money(model.position.allocatedCashMinor, c)}</strong><small>Part of your current balance</small></article>
        <article><span>Net worth</span><strong>{money(model.position.netWorthMinor, c)}</strong><small>Cash balance + investments</small></article>
        <article className="projection-card"><label htmlFor="overview-projection-date">Projected balance</label><strong>{money(model.projection.liquidCashMinor, c)}</strong><input className="projection-date-input" id="overview-projection-date" type="date" min={model.projection.minDate} max={model.projection.maxDate} value={model.projection.date} onChange={(event) => setProjectionDate(event.target.value)}/><small>Includes planned money through this date</small></article>
      </div>
    </section>

    <div className="overview-two overview-primary-grid">
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Funds</p><h2>Money set aside</h2></div><Link to="/funds">Manage funds →</Link></div><div className="overview-funds">{model.funds.map((fund) => <article key={fund.id}><div><strong>{fund.name}</strong><span>{money(fund.balanceMinor, c)}{fund.targetMinor != null ? ` of ${money(fund.targetMinor, c)}` : ""}</span></div>{fund.progress != null ? <div className="progress-track" aria-label={`${fund.name} ${Math.round(fund.progress * 100)}% complete`}><span style={{ width: `${fund.progress * 100}%` }}/></div> : null}</article>)}</div>{!model.funds.length ? <p className="muted">No funds yet.</p> : null}</section>
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Actual this month · {flow.month}</p><h2>Monthly cash flow</h2></div><Link to="/money/transactions">Record activity →</Link></div><dl className="metric-list"><div><dt>Income received</dt><dd className="positive">{money(flow.incomeMinor, c)}</dd></div><div><dt>Expenses paid</dt><dd>{money(flow.expenseMinor, c)}</dd></div><div><dt>Left after expenses</dt><dd>{money(flow.netMinor, c)}</dd></div></dl><p className="muted">Calculated from completed income and expenses. Opening balances, transfers and fund allocations are excluded.</p></section>
    </div>

    <section className="money-panel upcoming-panel"><div className="panel-heading"><div><p className="section-kicker">Next 30 days</p><h2>Upcoming</h2></div><Link to="/forecast">Open forecast →</Link></div><ul className="overview-list">{model.upcoming.map((row) => <li key={row.id}><time>{row.date}</time><span><strong>{row.label}</strong></span><b className={row.kind === "income" ? "positive" : row.kind === "expense" ? "negative" : ""}>{row.kind === "income" ? "+" : row.kind === "expense" ? "−" : "↔"}{money(row.amountMinor, c)}</b></li>)}</ul>{!model.upcoming.length ? <p className="muted">Nothing planned in the next 30 days.</p> : null}{model.overdue.length ? <p className="attention-note">{model.overdue.length} overdue item{model.overdue.length === 1 ? "" : "s"} need your attention in Forecast.</p> : null}</section>
    <Drawer open={balanceOpen} onClose={() => setBalanceOpen(false)} eyebrow="Current money" title="Edit total current balance"><form className="money-form" onSubmit={(event) => { event.preventDefault(); reconcile.mutate(); }}><label>Total current balance<input aria-label="New total current balance" value={balanceAmount} onChange={(event) => { setBalanceAmount(event.target.value); setConfirmBalance(false); }} inputMode="decimal" required autoFocus/></label>{balanceDifference != null ? <div className="reconcile-result"><span>Current: {money(currentTotalMinor, c)}</span><span>Change: {money(balanceDifference, c)}</span></div> : null}{balanceDifference !== null && balanceDifference !== 0 ? <label className="check-label"><input type="checkbox" checked={confirmBalance} onChange={(event) => setConfirmBalance(event.target.checked)}/>Confirm this balance adjustment</label> : null}<p className="form-help">Runway records the difference as a traceable adjustment. Previous activity is not rewritten.</p>{reconcile.error ? <p className="field-error" role="alert">{userFacingError(reconcile.error, "The balance could not be updated.")}</p> : null}<button className="primary-button" type="submit" disabled={!confirmBalance || balanceDifference === 0 || reconcile.isPending}>{reconcile.isPending ? "Updating…" : "Update balance"}</button></form></Drawer>
  </Page>;
}
