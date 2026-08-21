import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Page } from "~/components/page";
import { fundsRepository } from "~/data/repositories/funds-repository";
import { asMinorUnits, formatMinorUnits } from "~/domain/money";

function money(value:number,currency:string){return formatMinorUnits(asMinorUnits(value),currency);}

export default function FundsRoute(){
  const workspace=useQuery({queryKey:["funds-workspace"],queryFn:()=>fundsRepository.getWorkspace()});
  const data=workspace.data;
  const balances=new Map(data?.balances.map(row=>[row.fund_id,Number(row.balance_minor)]));
  return <Page eyebrow="Money set aside" title="Funds" description="Give part of your cash a job—such as Emergency, Home, or Travel. The money stays in your account until you make a real transfer.">
    <div className="panel-heading"><p className="muted">Each fund starts at zero. The card shows what is set aside now; payday contributions are supporting details, not part of the balance.</p><Link className="primary-button" to="/funds/payday">Review payday plan</Link></div>
    {workspace.isLoading?<p className="muted">Loading funds…</p>:null}{workspace.error?<p className="field-error">Funds could not be loaded.</p>:null}
    <section className="fund-grid" aria-label="Funds">{data?.funds.map(fund=>{
      const balance=balances.get(fund.id)??0;
      const goal=data.goals.find(row=>row.fund_id===fund.id&&row.is_primary);
      const threshold=goal?.target_minor??goal?.preferred_balance_minor??goal?.cap_minor;
      const completion=threshold?Math.min(100,Math.round(balance/Number(threshold)*100)):0;
      const item=data.items.find(row=>row.destination_fund_id===fund.id&&row.active);
      return <article className="fund-card" key={fund.id}>
        <div className="fund-card-heading"><div><h2>{fund.name}</h2><strong className="fund-balance">{money(balance,fund.currency)}</strong></div><span>Current balance</span></div>
        <div className="fund-progress">{threshold?<><div className="progress-track"><span style={{width:`${completion}%`}}/></div><p>{completion}% of {money(Number(threshold),fund.currency)}</p></>:<p>No goal set</p>}</div>
        <div className="fund-card-meta"><span>Payday plan</span><strong>{item?money(Number(item.amount_minor),fund.currency):"Not set"}</strong></div>
        <Link className="fund-card-link" to={`/funds/${fund.id}`}>View or change this fund →</Link>
      </article>})}{data&&!data.funds.length?<div className="inline-empty"><strong>No funds yet</strong><span>Create a fund when you want to set cash aside for a specific purpose.</span></div>:null}</section>
    {data?.backing.some(row=>!row.backing_valid)?<section className="money-panel attention-panel"><strong>Backing needs attention</strong><p className="muted">Allocated fund balances exceed cash in a backing account. New allocations are blocked.</p></section>:null}
  </Page>;
}
