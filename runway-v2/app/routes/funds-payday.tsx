import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { fundsRepository } from "~/data/repositories/funds-repository";
import { budgetsRepository } from "~/data/repositories/budgets-repository";
import { calculateSafeToSpendTrace } from "~/domain/allocations";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { buildForecastScreenModel, calendarDateInTimezone } from "~/read-models/forecast";

function money(value: number, currency: string) { return formatMinorUnits(asMinorUnits(Math.trunc(value)), currency); }
function inputAmount(value: number) { return (value / 100).toFixed(value % 100 ? 2 : 0); }

export default function FundsPaydayRoute() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["payday-workspace"], queryFn: async () => {
    const [funds, forecast] = await Promise.all([fundsRepository.getWorkspace(), forecastRepository.getWorkspace()]);
    return { funds, forecast };
  } });
  const budgets = useQuery({ queryKey: ["budget-workspace"], queryFn: () => budgetsRepository.getWorkspace() });
  const [amounts, setAmounts] = useState<Record<string, string>>({}); const [notice, setNotice] = useState("");
  const view = useMemo(() => {
    if (!query.data || !budgets.data) return null;
    const { funds, forecast } = query.data, today = calendarDateInTimezone(forecast.profile.timezone), model = buildForecastScreenModel(forecast, 1, [], today, budgets.data);
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
    const planItems = [...funds.items].filter((row) => row.plan_id === plan?.id && row.active).sort((a, b) => a.priority - b.priority);
    return { plan, planItems, safeTrace, currency: funds.profile.base_currency };
  }, [query.data, budgets.data]);
  useEffect(() => {
    if (view) setAmounts(Object.fromEntries(view.planItems.map((row) => [row.id, inputAmount(Number(row.amount_minor))])));
  }, [view]);
  const approvedMinor = (id: string) => { try { return Math.max(0, Number(parseDisplayAmountToMinor(amounts[id] || "0"))); } catch { return 0; } };
  const execute = useMutation({ mutationFn: async () => {
    if (!view?.plan) throw new Error("No active payday plan.");
    const items = view.planItems.map((row) => { const approved = approvedMinor(row.id); return { plan_item_id: row.id, recommended_minor: approved, approved_minor: approved }; });
    await Promise.all(items.map((item) => fundsRepository.updatePlanItem(item.plan_item_id, { amount_minor: item.approved_minor })));
    return fundsRepository.executePayday(view.plan.id, null, items, `payday-ui:${view.plan.id}:${crypto.randomUUID()}`);
  }, onSuccess: () => { setNotice("Allocations confirmed. Your fund balances have been updated."); void qc.invalidateQueries(); }, onError: (value) => setNotice(value instanceof Error ? value.message : "The allocations could not be confirmed.") });
  const assignedTotal = view?.planItems.reduce((sum, row) => sum + approvedMinor(row.id), 0) ?? 0;
  const availableMinor = view?.safeTrace.safeToSpendMinor ?? 0;
  const exceedsAvailable = assignedTotal > availableMinor;
  return <Page eyebrow="Payday plan" title="Choose your payday amounts" description="Enter how much you want to set aside for each fund, then confirm.">
    {query.isLoading || budgets.isLoading ? <p className="muted">Loading payday plan…</p> : null}{query.error || budgets.error ? <p className="field-error">The payday plan could not be loaded.</p> : null}
    {view ? <section className="money-panel payday-panel"><div className="panel-heading"><div><p className="section-kicker">Your funds</p><h2>Set each amount</h2></div></div>
        <div className="payday-list">{view.planItems.map((row) => <article className="payday-row" key={row.id}><strong>{row.label}</strong><label><span className="sr-only">Amount for {row.label}</span><input aria-label={`${row.label} amount`} type="number" min="0" step="0.01" value={amounts[row.id] ?? "0"} onChange={(event) => setAmounts((current) => ({ ...current, [row.id]: event.target.value }))}/><small>{view.currency}</small></label></article>)}</div>
        {notice ? <p className={notice.startsWith("Allocations confirmed") ? "form-notice" : "field-error"}>{notice}</p> : null}
        {exceedsAvailable ? <p className="field-error">You can set aside up to {money(availableMinor, view.currency)} after money already in funds, upcoming bills, and your {money(view.safeTrace.operatingFloorMinor, view.currency)} cash minimum are covered. You can change the cash minimum in Settings.</p> : null}
        <button className="primary-button" aria-label="Confirm fund allocations" disabled={execute.isPending || exceedsAvailable || view.planItems.every((row) => approvedMinor(row.id) === 0)} onClick={() => execute.mutate()}>Confirm allocations</button>
      </section> : null}
  </Page>;
}
