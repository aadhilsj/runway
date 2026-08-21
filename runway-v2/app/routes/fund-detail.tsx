import { useEffect,useState,type FormEvent } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { Link,useParams } from "react-router";
import { Page } from "~/components/page";
import { fundsRepository } from "~/data/repositories/funds-repository";
import { asMinorUnits,formatMinorUnits,parseDisplayAmountToMinor } from "~/domain/money";

function money(value:number,currency:string){return formatMinorUnits(asMinorUnits(value),currency);}
function inputMoney(value:number|null|undefined){return value==null?"":(Number(value)/100).toFixed(Number(value)%100?2:0);}
function nullableMinor(value:string){return value.trim()?Number(parseDisplayAmountToMinor(value)):null;}

export default function FundDetailRoute(){
  const {fundId}=useParams();const qc=useQueryClient();
  const workspace=useQuery({queryKey:["funds-workspace"],queryFn:()=>fundsRepository.getWorkspace()});
  const [amount,setAmount]=useState(""),[description,setDescription]=useState(""),[error,setError]=useState(""),[settingsNotice,setSettingsNotice]=useState("");
  const [preferred,setPreferred]=useState(""),[target,setTarget]=useState(""),[cap,setCap]=useState(""),[payday,setPayday]=useState("");
  const fund=workspace.data?.funds.find(row=>row.id===fundId);
  const balance=Number(workspace.data?.balances.find(row=>row.fund_id===fundId)?.balance_minor??0);
  const goal=workspace.data?.goals.find(row=>row.fund_id===fundId&&row.is_primary);
  const planItem=workspace.data?.items.find(row=>row.destination_fund_id===fundId&&row.active);
  useEffect(()=>{setPreferred(inputMoney(goal?.preferred_contribution_minor));setTarget(inputMoney(goal?.target_minor));setCap(inputMoney(goal?.cap_minor));setPayday(inputMoney(planItem?.amount_minor));},[goal?.id,goal?.preferred_contribution_minor,goal?.target_minor,goal?.cap_minor,planItem?.id,planItem?.amount_minor]);
  const refreshMoneyViews=()=>Promise.all([qc.invalidateQueries({queryKey:["funds-workspace"]}),qc.invalidateQueries({queryKey:["analytics-workspace"]}),qc.invalidateQueries({queryKey:["forecast-workspace"]}),qc.invalidateQueries({queryKey:["payday-workspace"]})]);
  const command=useMutation({mutationFn:async(kind:"allocate"|"release")=>{if(!fundId)throw new Error("Fund unavailable");const minor=Number(parseDisplayAmountToMinor(amount));if(minor<=0)throw new Error("Enter a positive amount.");const key=`fund-ui:${kind}:${fundId}:${crypto.randomUUID()}`;if(kind==="allocate")await fundsRepository.allocate(fundId,minor,description||"Manual allocation",key);else await fundsRepository.release(fundId,minor,description||"Manual release",key);},onSuccess:async()=>{setAmount("");setDescription("");setError("");await refreshMoneyViews();},onError:value=>setError(value instanceof Error?value.message:"Command failed")});
  const saveSettings=useMutation({mutationFn:async()=>{if(!goal)throw new Error("This fund does not have an editable goal yet.");await fundsRepository.updateGoal(goal.id,{preferred_contribution_minor:nullableMinor(preferred),target_minor:nullableMinor(target),cap_minor:nullableMinor(cap)});if(planItem)await fundsRepository.updatePlanItem(planItem.id,{amount_minor:nullableMinor(payday)??0});},onSuccess:async()=>{setSettingsNotice("Fund settings saved.");await refreshMoneyViews();},onError:value=>setSettingsNotice(value instanceof Error?value.message:"Settings could not be saved.")});
  function submit(event:FormEvent,kind:"allocate"|"release"){event.preventDefault();command.mutate(kind);}
  if(workspace.isLoading)return <Page eyebrow="Fund" title="Loading…" description="Loading the fund workspace."/>;
  if(!fund)return <Page eyebrow="Fund" title="Fund not found" description="This fund is unavailable or no longer active."><Link to="/funds">Back to funds</Link></Page>;
  const movements=workspace.data?.movements.filter(row=>row.fund_id===fund.id)??[];
  return <Page eyebrow="Fund detail" title={fund.name} description="See what is set aside, adjust this fund’s goal, or move cash in and out.">
    <div className="panel-heading"><Link to="/funds">← All funds</Link></div>
    <section className="fund-detail-summary"><div><span>Current balance</span><strong>{money(balance,fund.currency)}</strong></div><form onSubmit={event=>{event.preventDefault();saveSettings.mutate();}}><div className="fund-settings-grid"><label>Preferred contribution<input value={preferred} inputMode="decimal" onChange={event=>setPreferred(event.target.value)} placeholder="Not set"/><small>{fund.currency}</small></label><label>Target<input value={target} inputMode="decimal" onChange={event=>setTarget(event.target.value)} placeholder="No target"/><small>{fund.currency}</small></label><label>Cap<input value={cap} inputMode="decimal" onChange={event=>setCap(event.target.value)} placeholder="No cap"/><small>{fund.currency}</small></label><label>Each payday<input value={payday} inputMode="decimal" onChange={event=>setPayday(event.target.value)} placeholder="Not set"/><small>{fund.currency}</small></label></div>{settingsNotice?<p className={settingsNotice.endsWith("saved.")?"form-notice":"field-error"}>{settingsNotice}</p>:null}<button disabled={saveSettings.isPending||!goal}>Save fund settings</button></form></section>
    <div className="fund-detail-layout"><section className="money-panel fund-command-panel"><p className="section-kicker">Move money</p><h2>Allocate or release</h2><form className="money-form" onSubmit={event=>submit(event,"allocate")}><label>Amount<input value={amount} inputMode="decimal" onChange={event=>setAmount(event.target.value)} required/></label><label>Note <span className="optional">optional</span><input value={description} onChange={event=>setDescription(event.target.value)}/></label>{error?<p className="field-error">{error}</p>:null}<div className="button-row"><button className="primary-button" disabled={command.isPending}>Allocate</button><button type="button" disabled={command.isPending||balance===0} onClick={()=>command.mutate("release")}>Release</button></div></form><p className="form-help">This changes how your existing cash is organised. It is not spending.</p></section>
      <section className="money-panel fund-history-panel"><div className="panel-heading"><div><p className="section-kicker">History</p><h2>Movements</h2></div><span className="muted">{movements.length}</span></div>{movements.length?<ul className="compact-list">{movements.map(row=><li key={row.id}><span><strong>{row.description}</strong><small>{row.kind} · {new Date(row.occurred_at).toLocaleDateString()}</small></span><strong className={row.amount_minor<0?"negative":"positive"}>{money(Number(row.amount_minor),fund.currency)}</strong></li>)}</ul>:<div className="inline-empty"><strong>No movements yet</strong><span>Allocations and releases will appear here.</span></div>}</section></div>
  </Page>;
}
