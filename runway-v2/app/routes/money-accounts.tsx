import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Drawer } from "~/components/drawer";
import { MoneySummaryCards } from "~/components/money/summary-cards";
import { Page } from "~/components/page";
import { accountsRepository } from "~/data/repositories/accounts-repository";
import { balancesRepository } from "~/data/repositories/balances-repository";
import { snapshotsRepository } from "~/data/repositories/snapshots-repository";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { userFacingError } from "~/user-facing-error";

type Account = Awaited<ReturnType<typeof accountsRepository.listAccountsWithBalances>>[number];
type CreatableSubtype = Exclude<Account["subtype"], "system">;

function message(error: unknown): string {
  return userFacingError(error, "The request could not be completed.");
}

function newKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function defaultLocalDateTime(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const labels: Record<Account["subtype"], string> = {
  checking: "Checking", savings: "Savings", cash: "Cash", investment: "Investment",
  credit_card: "Credit card", loan: "Loan", system: "System",
};

export default function AccountsRoute() {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [reconcileAmount, setReconcileAmount] = useState("");
  const [confirmAdjustment, setConfirmAdjustment] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const accounts = useQuery({ queryKey: ["accounts", "balances"], queryFn: () => accountsRepository.listAccountsWithBalances() });
  const netWorth = useQuery({ queryKey: ["net-worth"], queryFn: () => balancesRepository.getCurrentNetWorth("NOK") });
  const history = useQuery({
    queryKey: ["account-history", selectedAccountId],
    queryFn: () => accountsRepository.listAccountTransactions(selectedAccountId!),
    enabled: Boolean(selectedAccountId),
  });
  const snapshots = useQuery({
    queryKey: ["snapshots", selectedAccountId],
    queryFn: () => snapshotsRepository.listBalanceSnapshots(selectedAccountId!),
    enabled: Boolean(selectedAccountId),
  });

  const invalidateMoney = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["net-worth"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["account-history"] }),
      queryClient.invalidateQueries({ queryKey: ["snapshots"] }),
    ]);
  };

  const createAccount = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const subtype = String(data.get("subtype")) as CreatableSubtype;
      const liability = subtype === "credit_card" || subtype === "loan";
      const openingText = String(data.get("openingBalance") ?? "").trim();
      const openingBalanceMinor = openingText ? Number(parseDisplayAmountToMinor(openingText)) : null;
      return accountsRepository.createAccount({
        name: String(data.get("name")), class: liability ? "liability" : "asset", subtype,
        currency: "NOK", includeInNetWorth: true,
        liquidityClass: liability ? "liability" : subtype === "investment" ? "invested" : subtype === "checking" ? "operating" : "liquid",
        valuationMode: subtype === "investment" ? "manual_market_value" : "ledger",
        openedOn: String(data.get("openedOn") || new Date().toISOString().slice(0, 10)),
        openingBalanceMinor,
        openingOccurredAt: openingBalanceMinor == null ? null : new Date(String(data.get("openingOccurredAt"))).toISOString(),
        openingDescription: openingBalanceMinor == null ? null : "Opening balance",
        idempotencyKey: newKey("account"),
      });
    },
    onSuccess: async () => { setCreateOpen(false); await invalidateMoney(); },
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => accountsRepository.renameAccount(id, name),
    onSuccess: async () => { setRenamingId(null); await invalidateMoney(); },
  });
  const archive = useMutation({ mutationFn: accountsRepository.archiveAccount, onSuccess: invalidateMoney });
  const addSnapshot = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      if (!selectedAccountId) throw new Error("Choose an account first");
      const data = new FormData(form);
      return snapshotsRepository.createBalanceSnapshot({
        accountId: selectedAccountId,
        observedAt: new Date(String(data.get("observedAt"))).toISOString(),
        balanceMinor: Number(parseDisplayAmountToMinor(String(data.get("balance")))),
        source: "manual", notes: String(data.get("notes") || "") || null,
      });
    },
    onSuccess: invalidateMoney,
  });
  const reconcile = useMutation({
    mutationFn: async () => {
      if (!selectedAccountId) throw new Error("Choose an account first");
      return snapshotsRepository.reconcileAccount({
        accountId: selectedAccountId,
        observedBalanceMinor: Number(parseDisplayAmountToMinor(reconcileAmount)),
        observedAt: new Date().toISOString(), notes: "Manual account reconciliation",
        createAdjustment: true, idempotencyKey: newKey("reconciliation"),
      });
    },
    onSuccess: async () => { setReconcileAmount(""); setConfirmAdjustment(false); await invalidateMoney(); },
  });

  const visibleAccounts = accounts.data ?? [];
  const activeAccounts = visibleAccounts.filter((account) => !account.archived_at);
  const selected = visibleAccounts.find((account) => account.id === selectedAccountId) ?? null;
  const summary = useMemo(() => ({
    totalCash: activeAccounts.filter((account) => account.class === "asset" && ["checking", "savings", "cash"].includes(account.subtype)).reduce((sum, account) => sum + account.display_balance_minor, 0),
    operating: activeAccounts.filter((account) => account.liquidity_class === "operating").reduce((sum, account) => sum + account.display_balance_minor, 0),
    netWorth: Number(netWorth.data?.[0]?.net_worth_minor ?? 0),
  }), [activeAccounts, netWorth.data]);
  const observedMinor = (() => { try { return reconcileAmount ? Number(parseDisplayAmountToMinor(reconcileAmount)) : null; } catch { return null; } })();
  const difference = selected && observedMinor != null ? observedMinor - selected.display_balance_minor : null;

  const onCreate = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); createAccount.mutate(event.currentTarget); };
  const onSnapshot = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); addSnapshot.mutate(event.currentTarget); };

  return <Page eyebrow="Where your money lives" title="Accounts" description="See the real balance of each bank, cash, or debt account. Record money in Activity when a balance changes.">
    <MoneySummaryCards totalCashMinor={summary.totalCash} operatingCashMinor={summary.operating} netWorthMinor={summary.netWorth} accountCount={activeAccounts.length} />
    <div className="panel-heading page-actions"><p className="muted">Choose an account to inspect its ledger history or reconcile it.</p><button className="primary-button" type="button" onClick={() => setCreateOpen(true)}>Add account</button></div>
      <section className="money-panel" aria-labelledby="accounts-heading">
        <div className="panel-heading"><div><p className="section-kicker">Where money lives</p><h2 id="accounts-heading">Your accounts</h2></div></div>
        {accounts.isLoading ? <p className="muted">Loading accounts…</p> : null}
        {accounts.error ? <p className="field-error" role="alert">{message(accounts.error)}</p> : null}
        <div className="account-list">
          {activeAccounts.map((account) => <article className={`account-row ${selectedAccountId === account.id ? "selected" : ""}`} key={account.id}>
            <button className="account-main" type="button" onClick={() => setSelectedAccountId(account.id)}>
              <span><strong>{account.name}</strong><small>{labels[account.subtype]}</small></span>
              <span className={account.class === "liability" ? "negative" : ""}>{formatMinorUnits(asMinorUnits(account.display_balance_minor), "NOK")}</span>
            </button>
            <div className="row-actions"><button type="button" onClick={() => setRenamingId(account.id)}>Rename</button><button type="button" disabled={archive.isPending} onClick={() => { if (confirm(`Archive ${account.name}?`)) archive.mutate(account.id); }}>Archive</button></div>
            {renamingId === account.id ? <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); rename.mutate({ id: account.id, name: String(data.get("name")) }); }}><label>New name<input name="name" defaultValue={account.name} required maxLength={120}/></label><button type="submit">Save name</button></form> : null}
          </article>)}
          {!accounts.isLoading && activeAccounts.length === 0 ? <p className="muted">No active accounts yet.</p> : null}
        </div>
      </section>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} eyebrow="Add a home for money" title="Create account">
        <form className="money-form" onSubmit={onCreate}>
          <label>Account name<input name="name" required maxLength={120} placeholder="Savings account"/></label>
          <label>Account type<select name="subtype" defaultValue="savings"><option value="checking">Checking</option><option value="savings">Savings</option><option value="cash">Cash</option><option value="investment">Investment</option><option value="credit_card">Credit card</option><option value="loan">Loan</option></select></label>
          <label>Opened on<input name="openedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label>
          <label>Opening balance <span className="optional">optional</span><input name="openingBalance" inputMode="decimal" placeholder="0.00"/></label>
          <label>Opening time<input name="openingOccurredAt" type="datetime-local" defaultValue={defaultLocalDateTime()}/></label>
          <p className="form-help">An opening balance is a starting position, not income.</p>
          {createAccount.error ? <p className="field-error" role="alert">{message(createAccount.error)}</p> : null}
          <button className="primary-button" type="submit" disabled={createAccount.isPending}>{createAccount.isPending ? "Creating…" : "Create account"}</button>
        </form>
      </Drawer>
    {selected ? <section className="money-panel detail-panel" aria-labelledby="account-detail-heading">
      <div className="panel-heading"><div><p className="section-kicker">Account detail</p><h2 id="account-detail-heading">{selected.name}</h2></div><strong className="balance-emphasis">{formatMinorUnits(asMinorUnits(selected.display_balance_minor), "NOK")}</strong></div>
      <div className="detail-grid">
        <div><h3>Transaction history</h3>{history.isLoading ? <p className="muted">Loading…</p> : <ul className="compact-list">{history.data?.map((entry) => <li key={entry.id}><span>{entry.transactions?.description ?? "Transaction"}<small>{entry.transactions?.occurred_at ? new Date(entry.transactions.occurred_at).toLocaleDateString("en-GB") : ""}</small></span><strong>{formatMinorUnits(asMinorUnits(Number(entry.amount_minor)), "NOK")}</strong></li>)}</ul>}{!history.isLoading && !history.data?.length ? <p className="muted">No posted activity.</p> : null}</div>
        <div><h3>Observed balances</h3><form className="money-form compact" onSubmit={onSnapshot}><label>Bank balance<input name="balance" required inputMode="decimal" placeholder="0.00"/></label><label>Observed at<input name="observedAt" type="datetime-local" defaultValue={defaultLocalDateTime()} required/></label><label>Note<input name="notes" placeholder="Bank app"/></label><button type="submit">Record snapshot</button></form><ul className="compact-list">{snapshots.data?.slice(0, 4).map((snapshot) => <li key={snapshot.id}><span>{new Date(snapshot.observed_at).toLocaleDateString("en-GB")}<small>{snapshot.notes || "Manual snapshot"}</small></span><strong>{formatMinorUnits(asMinorUnits(Number(snapshot.balance_minor)), "NOK")}</strong></li>)}</ul></div>
        <div><h3>Reconcile</h3><p className="form-help">Compare the ledger with the bank. Runway never rewrites a balance silently.</p><label className="standalone-label">Actual bank balance<input value={reconcileAmount} onChange={(event) => { setReconcileAmount(event.target.value); setConfirmAdjustment(false); }} inputMode="decimal" placeholder="0.00"/></label>{difference != null ? <div className="reconcile-result"><span>Ledger: {formatMinorUnits(asMinorUnits(selected.display_balance_minor), "NOK")}</span><span>Difference: {formatMinorUnits(asMinorUnits(difference), "NOK")}</span></div> : null}{difference !== null && difference !== 0 ? <label className="check-label"><input type="checkbox" checked={confirmAdjustment} onChange={(event) => setConfirmAdjustment(event.target.checked)}/>Create a confirmed adjustment</label> : null}<button className="primary-button" type="button" disabled={!confirmAdjustment || difference === 0 || reconcile.isPending} onClick={() => reconcile.mutate()}>Create adjustment</button>{reconcile.error ? <p className="field-error" role="alert">{message(reconcile.error)}</p> : null}</div>
      </div>
    </section> : null}
  </Page>;
}
