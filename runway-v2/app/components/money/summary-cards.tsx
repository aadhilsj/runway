import { formatMinorUnits, asMinorUnits } from "~/domain/money";

export function MoneySummaryCards({ totalCashMinor, operatingCashMinor, netWorthMinor, accountCount }: {
  totalCashMinor: number;
  operatingCashMinor: number;
  netWorthMinor: number;
  accountCount: number;
}) {
  const cards = [
    ["Total cash", formatMinorUnits(asMinorUnits(totalCashMinor), "NOK")],
    ["Operating cash", formatMinorUnits(asMinorUnits(operatingCashMinor), "NOK")],
    ["Net worth", formatMinorUnits(asMinorUnits(netWorthMinor), "NOK")],
    ["Accounts", String(accountCount)],
  ];
  return <div className="money-summary" aria-label="Money summary">
    {cards.map(([label, value]) => <article className="metric-card" key={label}><p>{label}</p><strong>{value}</strong></article>)}
  </div>;
}
