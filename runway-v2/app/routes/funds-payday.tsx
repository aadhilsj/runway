import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { fundsRepository } from "~/data/repositories/funds-repository";
import { calculateSafeToSpendTrace, recommendAllocations } from "~/domain/allocations";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { buildForecastScreenModel, calendarDateInTimezone } from "~/read-models/forecast";

function money(value: number, currency: string) { return formatMinorUnits(asMinorUnits(Math.trunc(value)), currency); }
function inputAmount(value: number) { return (value / 100).toFixed(value % 100 ? 2 : 0); }

export default function FundsPaydayRoute() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["payday-workspace"], queryFn: async () => ({ funds: await fundsRepository.getWorkspace(), forecast: await forecastRepository.getWorkspace() }) });
  const [amounts, setAmounts] = useState<Record<string, string>>({}); const [notice, setNotice] = useState("");
  const view = useMemo(() => {
    if (!query.data) return null;
    const { funds, forecast } = query.data, today = calendarDateInTimezone(forecast.profile.timezone), model = buildForecastScreenModel(forecast, 1, [], today);
    const operatingIds = new Set(forecast.accounts.filter((row) => row.liquidity_class === "operating" && row.class === "asset").map((row) => row.id));
    const balanceMap = new Map(forecast.balances.map((row) => [row.account_id, Number(row.display_balance_minor ?? 0)]));
    const actualCash = forecast.accounts.filter((row) => operatingIds.has(row.id)).reduce((sum, row) => sum + (balanceMap.get(row.id) ?? 0), 0);
    const allocatedOperating = funds.backing.filter((row) => operatingIds.has(row.account_id)).reduce((sum, row) => sum + Number(row.allocated_minor), 0);
    const reliableRuleIds = new Set(forecast.rules.filter((rule) => rule.active && rule.kind === "income" && rule.is_reliable_income).map((rule) => rule.id));
    const nextReliableIncomeDate = model.result.events.find((event) => event.kind === "income" && event.recurrenceRuleId && reliableRuleIds.has(event.recurrenceRuleId))?.date ?? null;
    const safeTrace = calculateSafeToSpendTrace({ actualCashMinor: actualCash, allocatedOperatingMinor: allocatedOperating,
      operatingFloorMinor: Number(funds.profile.operating_floor_minor ?? 0), asOfDate: today, safetyWindowDays: Number(funds.profile.safety_window_days ?? 30), nextReliableIncomeDate,
      obligations: model.result.events.filter((event) => event.kind === "expense" && event.confidence !== "tentative" && event.sourceAccountId && operatingIds.has(event.sourceAccountId)).map((event) => ({ date: event.date, amountMinor: event.amountMinor, label: event.label })) });
    const plan = funds.plans.find((row) => row.is_default && row.active);
    const result = recommendAllocations({ asOfDate: today, safeAllocatableMinor: safeTrace.safeToSpendMinor,
      items: funds.items.filter((row) => row.plan_id === plan?.id).map((row) => ({ id: row.id, label: row.label, mode: row.mode, priority: row.priority, amountMinor: Number(row.amount_minor), active: row.active, destinationType: row.destination_type, destinationFundId: row.destination_fund_id, destinationAccountId: row.destination_account_id, stopBasis: row.stop_basis, startsOn: row.starts_on, endsOn: row.ends_on, activationSourceItemId: row.activation_source_item_id })),
      fundBalancesMinor: Object.fromEntries(funds.balances.map((row) => [row.fund_id, Number(row.balance_minor)])), goals: funds.goals.map((row) => ({ fundId: row.fund_id, targetMinor: row.target_minor, preferredMinor: row.preferred_balance_minor, capMinor: row.cap_minor })) });
    return { plan, result, safeTrace, currency: funds.profile.base_currency };
  }, [query.data]);
  useEffect(() => { if (view) setAmounts(Object.fromEntries(view.result.recommendations.map((row) => [row.itemId, inputAmount(row.recommendedMinor)]))); }, [view]);
  const approvedMinor = (id: string) => { try { return Math.max(0, Number(parseDisplayAmountToMinor(amounts[id] || "0"))); } catch { return 0; } };
  const execute = useMutation({ mutationFn: async () => {
    if (!view?.plan) throw new Error("No active payday plan.");
    const items = view.result.recommendations.map((row) => ({ plan_item_id: row.itemId, recommended_minor: row.recommendedMinor, approved_minor: approvedMinor(row.itemId) }));
    return fundsRepository.executePayday(view.plan.id, null, items, `payday-ui:${view.plan.id}:${crypto.randomUUID()}`);
  }, onSuccess: () => { setNotice("Split confirmed. Your fund balances have been updated."); void qc.invalidateQueries(); }, onError: (value) => setNotice(value instanceof Error ? value.message : "The split could not be confirmed.") });
  const recommendedTotal = view?.result.recommendations.reduce((sum, row) => sum + row.recommendedMinor, 0) ?? 0;
  return <Page eyebrow="Payday plan" title="Choose how to split available cash" description="See what can be set aside today, adjust the amounts, then confirm once.">
    {query.isLoading ? <p className="muted">Preparing your suggested split…</p> : null}{query.error ? <p className="field-error">The payday plan could not be loaded.</p> : null}
    {view ? <><section className="payday-equation" aria-label="How available cash is calculated"><div><span>Cash now</span><strong>{money(view.safeTrace.actualCashMinor, view.currency)}</strong></div><b>−</b><div><span>Upcoming bills</span><strong>{money(view.safeTrace.reservedObligationsMinor, view.currency)}</strong></div><b>−</b><div><span>Minimum kept in cash</span><strong>{money(view.safeTrace.operatingFloorMinor, view.currency)}</strong></div><b>=</b><div className="payday-available"><span>Available to split</span><strong>{money(view.safeTrace.safeToSpendMinor, view.currency)}</strong></div></section>
      <section className="money-panel"><div className="panel-heading"><div><p className="section-kicker">Suggested split</p><h2>Recommendation</h2><span className="muted">{recommendedTotal ? `Put ${money(recommendedTotal, view.currency)} toward your goals` : "Keep the cash available for now"}</span></div></div>
        <div className="payday-list">{view.result.recommendations.map((row) => <article className="payday-row" key={row.itemId}><div><strong>{row.label}</strong><span>{row.recommendedMinor > 0 ? `Suggested ${money(row.recommendedMinor, view.currency)}` : "Nothing available for this item"}{row.destinationType === "account" ? " · bank transfer needed" : ""}</span></div><label><span className="sr-only">Amount for {row.label}</span><input aria-label={`${row.label} amount`} inputMode="decimal" value={amounts[row.itemId] ?? "0"} onChange={(event) => setAmounts((current) => ({ ...current, [row.itemId]: event.target.value }))}/><small>{view.currency}</small></label></article>)}</div>
        {notice ? <p className={notice.startsWith("Split confirmed") ? "form-notice" : "field-error"}>{notice}</p> : null}
        {view.result.recommendations.some((row) => row.reason === "partially-funded") ? <p className="muted">Partially funded because the rest of your cash is protected.</p> : null}
        <button className="primary-button" aria-label="Confirm fund allocations" disabled={execute.isPending || view.result.recommendations.every((row) => approvedMinor(row.itemId) === 0)} onClick={() => execute.mutate()}>Use this split</button>
        <p className="form-help">You can adjust any amount before confirming. Planned income is never included until it is received.</p>
      </section></> : null}
  </Page>;
}
