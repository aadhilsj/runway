import { useQuery } from "@tanstack/react-query";
import { Page } from "~/components/page";
import { forecastRepository } from "~/data/repositories/forecast-repository";
import { asMinorUnits, formatMinorUnits } from "~/domain/money";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Forecast items could not be loaded.";
}

export default function ForecastRoute() {
  const forecast = useQuery({
    queryKey: ["forecast-items", "expected"],
    queryFn: () => forecastRepository.listExpectedItems(),
  });
  const items = forecast.data ?? [];
  const incomeMinor = items.filter((item) => item.kind === "income").reduce((sum, item) => sum + Number(item.amount_minor), 0);
  const expenseMinor = items.filter((item) => item.kind === "expense").reduce((sum, item) => sum + Number(item.amount_minor), 0);

  return <Page eyebrow="Time and certainty" title="Forecast" description="Expected money is planning information. It never changes your actual account balances until you deliberately post an actual transaction.">
    <div className="actual-planned-strip">
      <div><strong>Actual</strong><span>Posted in the double-entry ledger and reflected in Accounts.</span></div>
      <div><strong>Planned</strong><span>Dated expectations preserved from legacy Runway for review.</span></div>
    </div>
    <section className="money-panel" aria-labelledby="forecast-heading">
      <div className="panel-heading">
        <div><p className="section-kicker">Base plan</p><h2 id="forecast-heading">Expected items</h2></div>
        <div className="forecast-totals"><span>Income <strong>{formatMinorUnits(asMinorUnits(incomeMinor), "NOK")}</strong></span><span>Expenses <strong>{formatMinorUnits(asMinorUnits(expenseMinor), "NOK")}</strong></span></div>
      </div>
      <p className="form-help">Scenario items remain associated with their plans. Phase 5 will add projection calculations; this view intentionally shows only the migrated planning inputs.</p>
      {forecast.isLoading ? <p className="muted">Loading expected items…</p> : null}
      {forecast.error ? <p className="field-error" role="alert">{message(forecast.error)}</p> : null}
      <div className="forecast-list">
        {items.map((item) => <article className="forecast-row" key={item.id}>
          <time dateTime={item.expected_date}>{new Date(`${item.expected_date}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</time>
          <div><strong>{item.label}</strong><span>{item.categories?.name ?? "Uncategorized"}{item.scenarios?.name ? ` · ${item.scenarios.name}` : " · Base plan"}</span></div>
          <strong className={item.kind === "expense" ? "negative" : "positive"}>{item.kind === "expense" ? "−" : "+"}{formatMinorUnits(asMinorUnits(Number(item.amount_minor)), "NOK")}</strong>
        </article>)}
        {!forecast.isLoading && items.length === 0 ? <p className="muted">No expected future items.</p> : null}
      </div>
    </section>
  </Page>;
}
