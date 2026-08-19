import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Page } from "~/components/page";

export default function OverviewRoute() {
  return <Page eyebrow="Your financial runway" title="A calmer view of what’s ahead" description="Balances, commitments, and goals will meet here once the normalized read model is available."><div className="chart-card"><div><p className="eyebrow">Cash outlook</p><h2>Forecast chart foundation</h2></div><div className="chart-frame" aria-label="Empty cash outlook chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[]}><defs><linearGradient id="runwayFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28}/><stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="label" hide/><YAxis hide/><Tooltip/><Area type="monotone" dataKey="value" stroke="var(--color-accent)" fill="url(#runwayFill)" /></AreaChart></ResponsiveContainer></div><p className="chart-note">The chart intentionally has no sample financial values.</p></div></Page>;
}
