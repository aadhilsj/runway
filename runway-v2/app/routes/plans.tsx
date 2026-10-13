import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { plansRepository, type PlanRow } from "~/data/repositories/plans-repository";
import { asMinorUnits, formatMinorUnits } from "~/domain/money";

function money(value: number, currency: string) { return formatMinorUnits(asMinorUnits(value), currency); }
function signedEffect(kind: string, amount: number) { return kind.includes("income") ? amount : kind.includes("expense") ? -amount : 0; }

export default function PlansRoute() {
  const qc = useQueryClient();
  const workspace = useQuery({ queryKey: ["plans-workspace"], queryFn: () => plansRepository.getWorkspace() });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<PlanRow | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["plans-workspace"] }), qc.invalidateQueries({ queryKey: ["forecast-workspace"] }), qc.invalidateQueries({ queryKey: ["analytics-workspace"] }), qc.invalidateQueries({ queryKey: ["payday-workspace"] })]);
  const create = useMutation({ mutationFn: () => plansRepository.createPlan({ name, description, status: "draft" }), onSuccess: async () => { setName(""); setDescription(""); setError(""); setDrawerOpen(false); await refresh(); }, onError: value => setError(value instanceof Error ? value.message : "Plan could not be created") });
  const remove = useMutation({ mutationFn: (id: string) => plansRepository.deletePlan(id), onSuccess: async () => { setDeleting(null); await refresh(); }, onError: value => setError(value instanceof Error ? value.message : "Plan could not be deleted") });
  function submit(event: FormEvent) { event.preventDefault(); if (!name.trim()) { setError("Give the Plan a name."); return; } create.mutate(); }
  const active = workspace.data?.plans.filter(plan => plan.status === "active" || plan.status === "draft") ?? [];
  const archived = workspace.data?.plans.filter(plan => plan.status === "archived" || plan.status === "applied") ?? [];
  return <Page eyebrow="What if?" title="Plans" description="Try a future decision—such as a trip or a move—and compare its effect without changing your real money.">
    <div className="page-action-row"><button className="primary-button" type="button" onClick={() => setDrawerOpen(true)}>Create plan</button><Link className="secondary-button" to="/plans/compare">Compare plans</Link></div>
    {workspace.isLoading ? <p className="muted">Loading Plans…</p> : null}{workspace.error ? <p className="field-error">Plans could not be loaded.</p> : null}{error ? <p className="field-error" role="alert">{error}</p> : null}
    <section className="money-panel compact-plan-panel"><div className="panel-heading"><div><p className="section-kicker">Active plans</p><h2>What you are exploring</h2></div></div><div className="plan-list">{active.map(plan => {
      const changes = workspace.data!.changes.filter(change => change.scenario_id === plan.id), items = workspace.data!.forecast.items.filter(item => item.scenario_id === plan.id && item.status === "expected"), rules = workspace.data!.forecast.rules.filter(rule => rule.scenario_id === plan.id && rule.active), count = changes.length + items.length + rules.length;
      const effect = items.reduce((sum, item) => sum + signedEffect(item.kind, Number(item.amount_minor)), 0) + changes.reduce((sum, item) => sum + signedEffect(item.change_type, Number(item.amount_minor ?? 0)), 0), currency = workspace.data!.forecast.profile.base_currency;
      return <article className="plan-row" key={plan.id}><div className="plan-row-copy"><h3>{plan.name}</h3>{plan.description ? <p>{plan.description}</p> : null}<small>{count} item{count === 1 ? "" : "s"}</small></div><div className="plan-value"><span>Total change</span><strong className={effect < 0 ? "negative" : effect > 0 ? "positive" : ""}>{effect > 0 ? "+" : ""}{money(effect, currency)}</strong>{rules.length ? <small>plus {rules.length} repeating item{rules.length === 1 ? "" : "s"}</small> : null}</div><div className="plan-actions"><Link className="plan-open-link" to={`/plans/${plan.id}`}>Open</Link><details className="plan-overflow"><summary aria-label={`More actions for ${plan.name}`}>•••</summary><div><button className="quiet-danger" type="button" onClick={() => setDeleting(plan)}>Delete plan</button></div></details></div></article>;
    })}{!active.length ? <div className="inline-empty"><strong>No active plans</strong><span>Create one when you want to test a meaningful decision.</span></div> : null}</div></section>
    <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} eyebrow="New plan" title="Explore one decision"><form className="money-form" onSubmit={submit}><label>Name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. New apartment"/></label><label>Description <span className="optional">optional</span><textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="A short note, if useful"/></label>{error ? <p className="field-error">{error}</p> : null}<button className="primary-button" disabled={create.isPending}>Save plan</button></form></Drawer>
    <Drawer open={Boolean(deleting)} onClose={() => setDeleting(null)} eyebrow="Delete plan" title={`Delete ${deleting?.name ?? "this Plan"}?`}><p>This removes the Plan and its forecast-only items. It does not change your actual balance or Activity.</p><div className="button-row"><button type="button" onClick={() => setDeleting(null)}>Cancel</button><button className="danger-button" type="button" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>{remove.isPending ? "Deleting…" : "Delete plan"}</button></div></Drawer>
    {archived.length ? <section className="money-panel"><p className="section-kicker">Reference</p><h2>Archived and applied</h2><ul className="compact-list">{archived.map(plan => <li key={plan.id}><span><strong>{plan.name}</strong><small>{plan.status}</small></span><Link to={`/plans/${plan.id}`}>View</Link></li>)}</ul></section> : null}
  </Page>;
}
