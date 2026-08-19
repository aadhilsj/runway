import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Page } from "~/components/page";
import { fundsRepository } from "~/data/repositories/funds-repository";
import { asMinorUnits, formatMinorUnits } from "~/domain/money";
function money(value:number,currency:string){return formatMinorUnits(asMinorUnits(value),currency);}
export default function FundsRoute(){
 const workspace=useQuery({queryKey:["funds-workspace"],queryFn:()=>fundsRepository.getWorkspace()});
 const data=workspace.data;const balances=new Map(data?.balances.map(row=>[row.fund_id,Number(row.balance_minor)]));
 return <Page eyebrow="Purposeful reserves" title="Funds" description="Virtual envelopes backed by real cash. Allocating money changes its purpose—not your account balance or net worth.">
  <div className="panel-heading"><p className="muted">Every fund starts at zero until you explicitly allocate.</p><Link className="primary-button" to="/funds/payday">Review payday plan</Link></div>
  {workspace.isLoading?<p className="muted">Loading funds…</p>:null}{workspace.error?<p className="field-error">Funds could not be loaded.</p>:null}
  <section className="fund-grid" aria-label="Funds">{data?.funds.map(fund=>{const balance=balances.get(fund.id)??0;const goal=data.goals.find(row=>row.fund_id===fund.id&&row.is_primary);const threshold=goal?.target_minor??goal?.preferred_balance_minor??goal?.cap_minor;const completion=threshold?Math.min(100,Math.round(balance/Number(threshold)*100)):0;return <article className="fund-card" key={fund.id}><div className="panel-heading"><div><p className="section-kicker">{fund.purpose_key??"Custom"}</p><h2>{fund.name}</h2></div><strong>{money(balance,fund.currency)}</strong></div>{threshold?<><div className="progress-track"><span style={{width:`${completion}%`}}/></div><p className="muted">{completion}% of {money(Number(threshold),fund.currency)}</p></>:<p className="muted">No balance threshold configured.</p>}<Link to={`/funds/${fund.id}`}>Open fund →</Link></article>})}{data && !data.funds.length ? <div className="inline-empty"><strong>No funds yet</strong><span>Create purposeful reserves from an account when you are ready to allocate cash.</span></div> : null}</section>
  {data?.backing.some(row=>!row.backing_valid)?<section className="money-panel attention-panel"><strong>Backing needs attention</strong><p className="muted">Allocated fund balances exceed cash in a backing account. New allocations are blocked.</p></section>:null}
 </Page>;
}
