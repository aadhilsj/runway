import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Drawer } from "~/components/drawer";
import { Page } from "~/components/page";
import { accountsRepository } from "~/data/repositories/accounts-repository";
import { budgetsRepository } from "~/data/repositories/budgets-repository";
import { categoriesRepository } from "~/data/repositories/categories-repository";
import { transactionsRepository } from "~/data/repositories/transactions-repository";
import { asMinorUnits, formatMinorUnits, parseDisplayAmountToMinor } from "~/domain/money";
import { userFacingError } from "~/user-facing-error";

type TransactionKind = "income" | "expense" | "transfer" | "debt_payment";
type Transaction = Awaited<ReturnType<typeof transactionsRepository.listTransactions>>[number];
type Account = Awaited<ReturnType<typeof accountsRepository.listAccountsWithBalances>>[number];

function message(error: unknown): string { return userFacingError(error, "The transaction could not be posted."); }
function newKey(prefix: string): string { return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`; }
function defaultLocalDateTime(): string { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function defaultLocalDate(): string { return defaultLocalDateTime().slice(0, 10); }
function monthStart(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`; }

function transactionDisplay(transaction: Transaction, accounts: Account[], categoryNames: Map<string, string>) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const visibleEntries = transaction.transaction_entries.filter((entry) => accountById.has(entry.account_id));
  const primary = visibleEntries.find((entry) => Number(entry.amount_minor) < 0) ?? visibleEntries[0];
  const amount = primary ? Math.abs(Number(primary.amount_minor)) : 0;
  const categoryId = transaction.transaction_entries.find((entry) => entry.category_id)?.category_id;
  const accountNames = visibleEntries.map((entry) => accountById.get(entry.account_id)?.name).filter(Boolean);
  return { amount, category: categoryId ? categoryNames.get(categoryId) : null, accountNames };
}

export default function TransactionsRoute() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const startsWithExpense = searchParams.get("new") === "expense";
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [createOpen, setCreateOpen] = useState(startsWithExpense);
  const [search, setSearch] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickCategoryId, setQuickCategoryId] = useState("");
  const [quickDate, setQuickDate] = useState(defaultLocalDate);
  const [quickDescription, setQuickDescription] = useState("");
  const transactions = useQuery({ queryKey: ["transactions"], queryFn: () => transactionsRepository.listTransactions({ limit: 250 }) });
  const accounts = useQuery({ queryKey: ["accounts", "balances"], queryFn: () => accountsRepository.listAccountsWithBalances() });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => categoriesRepository.listCategories() });
  const budgetWorkspace = useQuery({ queryKey: ["budget-workspace"], queryFn: () => budgetsRepository.getWorkspace() });
  const invalidateMoney = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["net-worth"] }),
      queryClient.invalidateQueries({ queryKey: ["account-history"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["forecast-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["payday-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["funds-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["budget-workspace"] }),
    ]);
  };
  const post = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const amountMinor = Number(parseDisplayAmountToMinor(String(data.get("amount"))));
      if (amountMinor <= 0) throw new Error("Enter a positive amount");
      const occurredAt = new Date(String(data.get("occurredAt"))).toISOString();
      const description = String(data.get("description"));
      const notes = String(data.get("notes") || "") || null;
      const categoryId = String(data.get("categoryId") || "") || null;
      if (kind === "income") return transactionsRepository.postIncome({ accountId: String(data.get("destinationAccountId")), amountMinor, categoryId, occurredAt, description, merchantOrSource: description, notes, idempotencyKey: newKey("income") });
      if (kind === "expense") return transactionsRepository.postExpense({ accountId: String(data.get("sourceAccountId")), amountMinor, categoryId, occurredAt, description, merchantOrSource: description, notes, idempotencyKey: newKey("expense") });
      if (kind === "transfer") return transactionsRepository.postTransfer({ sourceAccountId: String(data.get("sourceAccountId")), destinationAccountId: String(data.get("destinationAccountId")), amountMinor, occurredAt, description, notes, idempotencyKey: newKey("transfer") });
      return transactionsRepository.postDebtPayment({ sourceAccountId: String(data.get("sourceAccountId")), liabilityAccountId: String(data.get("liabilityAccountId")), principalMinor: amountMinor, occurredAt, description, notes, idempotencyKey: newKey("debt") });
    },
    onSuccess: async (_, form) => { form.reset(); setCreateOpen(false); await invalidateMoney(); },
  });
  const reverse = useMutation({
    mutationFn: (transactionId: string) => transactionsRepository.reverseTransaction({ transactionId, occurredAt: new Date().toISOString(), notes: "User-requested correction", idempotencyKey: newKey("reversal") }),
    onSuccess: invalidateMoney,
  });
  const accountRows = (accounts.data ?? []).filter((account) => !account.archived_at);
  const assets = accountRows.filter((account) => account.class === "asset");
  const liabilities = accountRows.filter((account) => account.class === "liability");
  const categoryRows = categories.data ?? [];
  const quickCategories = categoryRows.filter((category) => {
    const name = category.name.toLowerCase();
    return category.kind === "expense" && (name === "groceries" || name === "miscellaneous" || name === "misc");
  });
  const selectedQuickCategory = quickCategories.find((category) => category.id === quickCategoryId) ?? quickCategories[0];
  const operatingAccount = assets.find((account) => account.liquidity_class === "operating") ?? assets.find((account) => account.name.toLowerCase().includes("operating")) ?? assets[0];
  const quickSpend = useMutation({
    mutationFn: async () => {
      const amountMinor = Number(parseDisplayAmountToMinor(quickAmount));
      if (amountMinor <= 0) throw new Error("Enter how much you spent.");
      if (!selectedQuickCategory) throw new Error("Groceries and Miscellaneous categories are not available.");
      if (!operatingAccount) throw new Error("Operating Cash is not available.");
      const description = quickDescription.trim() || selectedQuickCategory.name;
      return transactionsRepository.postExpense({
        accountId: operatingAccount.id,
        amountMinor,
        categoryId: selectedQuickCategory.id,
        occurredAt: new Date(`${quickDate}T12:00:00`).toISOString(),
        description,
        merchantOrSource: description,
        notes: null,
        idempotencyKey: newKey("quick-expense"),
      });
    },
    onSuccess: async () => { setQuickAmount(""); setQuickDescription(""); await invalidateMoney(); },
  });
  const applicableCategories = categoryRows.filter((category) => category.kind === (kind === "income" ? "income" : "expense"));
  const categoryNames = useMemo(() => new Map(categoryRows.map((category) => [category.id, category.name])), [categoryRows]);
  const filtered = (transactions.data ?? []).filter((transaction) => {
    const needle = search.trim().toLowerCase();
    return !needle || transaction.description.toLowerCase().includes(needle) || transaction.kind.includes(needle);
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); post.mutate(event.currentTarget); };
  const onQuickSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); quickSpend.mutate(); };
  const currentMonthStart = monthStart(new Date());
  const currentPeriod = budgetWorkspace.data?.periods.find((period) => period.month_start === currentMonthStart);
  const quickTrackers = quickCategories.map((category) => {
    const spentMinor = (budgetWorkspace.data?.actuals ?? []).filter((row) => row.month_start === currentMonthStart && row.category_id === category.id).reduce((sum, row) => sum + Number(row.actual_minor), 0);
    const directLine = currentPeriod ? budgetWorkspace.data?.lines.find((line) => line.budget_period_id === currentPeriod.id && line.category_id === category.id) : undefined;
    const groupIds = (budgetWorkspace.data?.groupCategories ?? []).filter((row) => row.category_id === category.id).map((row) => row.group_id);
    const groupLine = currentPeriod ? budgetWorkspace.data?.lines.find((line) => line.budget_period_id === currentPeriod.id && Boolean(line.group_id) && groupIds.includes(line.group_id!)) : undefined;
    const line = directLine ?? groupLine;
    const group = groupLine ? budgetWorkspace.data?.groups.find((row) => row.id === groupLine.group_id) : undefined;
    const budgetedMinor = line ? Number(line.budgeted_minor) : null;
    const groupCategoryIds = groupLine ? (budgetWorkspace.data?.groupCategories ?? []).filter((row) => row.group_id === groupLine.group_id).map((row) => row.category_id) : [];
    const totalSpentMinor = groupLine ? (budgetWorkspace.data?.actuals ?? []).filter((row) => row.month_start === currentMonthStart && groupCategoryIds.includes(row.category_id)).reduce((sum, row) => sum + Number(row.actual_minor), 0) : spentMinor;
    return { category, spentMinor, budgetedMinor, remainingMinor: budgetedMinor === null ? null : budgetedMinor - totalSpentMinor, groupName: group?.name };
  });
  const trackerCurrency = budgetWorkspace.data?.currency ?? "NOK";

  return <Page eyebrow="What really happened" title="Activity" description="Record money after it moves. Income, spending, and transfers here update your real account balances; Forecast items do not.">
    <div className="actual-planned-strip"><div><strong>Actual</strong><span>Money that really moved and is backed by the ledger.</span></div><div><strong>Planned</strong><span>Expected future movement shown separately in Forecast.</span></div></div>
    <section className="money-panel quick-spend-panel" aria-labelledby="quick-spend-heading">
      <div className="panel-heading quick-spend-heading"><div><p className="section-kicker">Everyday spending</p><h2 id="quick-spend-heading">Log spending</h2></div><span>Today · {operatingAccount?.name ?? "Operating Cash"}</span></div>
      <div className="quick-spend-trackers" aria-label="This month's variable spending">
        {quickTrackers.map(({ category, spentMinor, budgetedMinor, remainingMinor, groupName }) => <article key={category.id}>
          <span>{category.name}</span><strong>{formatMinorUnits(asMinorUnits(spentMinor), trackerCurrency)} spent</strong>
          <small>{budgetedMinor === null ? "No monthly limit set" : `${formatMinorUnits(asMinorUnits(remainingMinor ?? 0), trackerCurrency)} left${groupName ? ` in shared ${groupName}` : ""}`}</small>
        </article>)}
      </div>
      <form className="quick-spend-form" onSubmit={onQuickSubmit}>
        <label>Amount<input aria-label="Quick spend amount" value={quickAmount} onChange={(event) => setQuickAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required/></label>
        <fieldset><legend>Category</legend><div>{quickCategories.map((category) => <button type="button" key={category.id} className={selectedQuickCategory?.id === category.id ? "active" : ""} aria-pressed={selectedQuickCategory?.id === category.id} onClick={() => setQuickCategoryId(category.id)}>{category.name}</button>)}</div></fieldset>
        <label>Date<input aria-label="Quick spend date" type="date" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} required/></label>
        <label>Description <span className="optional">optional</span><input aria-label="Quick spend description" value={quickDescription} onChange={(event) => setQuickDescription(event.target.value)} maxLength={240} placeholder="What was it?"/></label>
        <button className="primary-button" type="submit" disabled={quickSpend.isPending || !selectedQuickCategory || !operatingAccount}>{quickSpend.isPending ? "Saving…" : "Save expense"}</button>
      </form>
      {quickSpend.error ? <p className="field-error" role="alert">{message(quickSpend.error)}</p> : null}
      {budgetWorkspace.error ? <p className="muted">Spending can still be logged, but this month’s limits could not be loaded.</p> : null}
    </section>
    <div className="panel-heading page-actions"><p className="muted">This is your record of money that really moved. If something is wrong, correct it without losing the original entry.</p><button className="primary-button" type="button" aria-label="Add transaction" onClick={() => setCreateOpen(true)}>Record activity</button></div>
    <section className="money-panel" aria-labelledby="history-heading">
        <div className="panel-heading"><div><p className="section-kicker">Your history</p><h2 id="history-heading">Money activity</h2></div></div>
        <label className="search-field">Search history<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Description or type"/></label>
        {transactions.isLoading ? <p className="muted">Loading transactions…</p> : null}
        {transactions.error ? <p className="field-error" role="alert">{message(transactions.error)}</p> : null}
        <div className="transaction-list">{filtered.map((transaction) => {
          const display = transactionDisplay(transaction, accountRows, categoryNames);
          const isReversal = Boolean(transaction.reverses_transaction_id);
          const reversed = (transactions.data ?? []).some((candidate) => candidate.reverses_transaction_id === transaction.id);
          return <article className="transaction-row" key={transaction.id}><div className="transaction-icon" data-kind={transaction.kind}>{transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : "↔"}</div><div><strong>{transaction.description}</strong><p>{new Date(transaction.occurred_at).toLocaleString("en-GB")} · {transaction.kind.replace("_", " ")}</p><small>{[display.category, ...display.accountNames].filter(Boolean).join(" · ")}</small></div><div className="transaction-amount"><strong>{formatMinorUnits(asMinorUnits(display.amount), "NOK")}</strong>{isReversal ? <span>Correction</span> : reversed ? <span>Reversed</span> : transaction.kind !== "opening_balance" ? <button type="button" disabled={reverse.isPending} onClick={() => { if (confirm("Reverse this transaction? Runway will keep the original and create a correction.")) reverse.mutate(transaction.id); }}>Reverse transaction</button> : <span>Opening state</span>}</div></article>;
        })}{!transactions.isLoading && filtered.length === 0 ? <p className="muted">No matching posted transactions.</p> : null}</div>
      </section>
    <Drawer open={createOpen} onClose={() => setCreateOpen(false)} eyebrow="Update your real balance" title="Record activity">
        <div className="segmented-control" aria-label="Transaction type">{(["income", "expense", "transfer", "debt_payment"] as const).map((value) => <button type="button" className={kind === value ? "active" : ""} aria-pressed={kind === value} onClick={() => setKind(value)} key={value}>{value === "debt_payment" ? "Debt payment" : value[0]!.toUpperCase() + value.slice(1)}</button>)}</div>
        <form className="money-form" onSubmit={onSubmit}>
          <label>Amount<input name="amount" required inputMode="decimal" placeholder="0.00"/></label>
          {(kind === "expense" || kind === "transfer" || kind === "debt_payment") ? <label>From account<select name="sourceAccountId" required>{assets.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}
          {(kind === "income" || kind === "transfer") ? <label>To account<select name="destinationAccountId" required>{assets.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}
          {kind === "debt_payment" ? <label>Liability<select name="liabilityAccountId" required>{liabilities.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}
          {(kind === "income" || kind === "expense") ? <label>Category<select name="categoryId"><option value="">Uncategorized</option>{applicableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label> : null}
          <label>Date and time<input name="occurredAt" type="datetime-local" required defaultValue={defaultLocalDateTime()}/></label>
          <label>Description<input name="description" required maxLength={240} placeholder={kind === "income" ? "Salary" : kind === "expense" ? "Rent" : "Transfer"}/></label>
          <label>Notes <span className="optional">optional</span><textarea name="notes" maxLength={4000}/></label>
          {kind === "transfer" ? <p className="form-help">Transfers move money between your accounts. They are not income or spending and do not change net worth.</p> : null}
          {kind === "debt_payment" && liabilities.length === 0 ? <p className="field-error">Create a credit card or loan account first.</p> : null}
          {post.error ? <p className="field-error" role="alert">{message(post.error)}</p> : null}
          <button className="primary-button" type="submit" disabled={post.isPending || assets.length === 0 || (kind === "debt_payment" && liabilities.length === 0)}>{post.isPending ? "Posting…" : `Post ${kind === "debt_payment" ? "debt payment" : kind}`}</button>
        </form>
    </Drawer>
  </Page>;
}
