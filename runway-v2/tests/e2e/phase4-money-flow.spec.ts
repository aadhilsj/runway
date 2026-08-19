import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OPERATING_ID = "22222222-2222-4222-8222-222222222222";
const SAVINGS_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

interface FixtureAccount {
  id: string; user_id: string; name: string; class: "asset"; subtype: "checking" | "savings";
  currency: string; include_in_net_worth: boolean; liquidity_class: "operating" | "liquid";
  valuation_mode: "ledger"; is_system: boolean; system_key: null; opened_on: string;
  archived_at: null; created_at: string; updated_at: string;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", headers: { "content-range": "0-0/1" }, body: JSON.stringify(body) });
}

async function installFixtureBackend(page: Page) {
  const now = "2026-08-19T12:00:00.000Z";
  const account = (id: string, name: string, subtype: "checking" | "savings", liquidity: "operating" | "liquid"): FixtureAccount => ({
    id, user_id: USER_ID, name, class: "asset", subtype, currency: "NOK", include_in_net_worth: true,
    liquidity_class: liquidity, valuation_mode: "ledger", is_system: false, system_key: null,
    opened_on: "2026-08-19", archived_at: null, created_at: now, updated_at: now,
  });
  const accounts = [account(OPERATING_ID, "Operating Cash", "checking", "operating")];
  const balances = new Map([[OPERATING_ID, 1_195_600]]);
  const transactions: Array<Record<string, unknown>> = [{
    id: "55555555-5555-4555-8555-555555555555", user_id: USER_ID, kind: "opening_balance", status: "posted",
    currency: "NOK", occurred_at: now, description: "Opening balance", merchant_or_source: null, notes: null,
    provenance: "verified", idempotency_key: "opening", legacy_source_id: null, reverses_transaction_id: null,
    created_at: now, posted_at: now, transaction_entries: [
      { id: "opening-entry", user_id: USER_ID, transaction_id: "55555555-5555-4555-8555-555555555555", account_id: OPERATING_ID, category_id: null, amount_minor: 1_195_600 },
    ],
  }];
  const snapshots: Array<Record<string, unknown>> = [];
  let sequence = 0;
  const newId = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, "0")}`;
  const netWorth = () => [...balances.values()].reduce((sum, value) => sum + value, 0);
  const addTransaction = (kind: string, description: string, entries: Array<{ account_id: string; amount_minor: number }>, reverses: string | null = null) => {
    const id = newId();
    for (const entry of entries) balances.set(entry.account_id, (balances.get(entry.account_id) ?? 0) + entry.amount_minor);
    transactions.unshift({ id, user_id: USER_ID, kind, status: "posted", currency: "NOK", occurred_at: now,
      description, merchant_or_source: description, notes: null, provenance: "user_entered", idempotency_key: newId(),
      legacy_source_id: null, reverses_transaction_id: reverses, created_at: now, posted_at: now,
      transaction_entries: entries.map((entry) => ({ ...entry, id: newId(), user_id: USER_ID, transaction_id: id, category_id: CATEGORY_ID })),
    });
    return id;
  };

  const token = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ sub: USER_ID, role: "authenticated", exp: 4_102_444_800 })).toString("base64url")}.fixture`;
  const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: { provider: "email" }, user_metadata: {}, created_at: now };
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, token_type: "bearer", expires_in: 3600,
      expires_at: 4_102_444_800, refresh_token: "fixture-refresh", user }));
  }, { token, user });

  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith("/auth/v1/")) return json(route, user);
    if (url.pathname === "/rest/v1/accounts" && request.method() === "GET") return json(route, accounts);
    if (url.pathname === "/rest/v1/account_balances") return json(route, accounts.map((row) => ({ user_id: USER_ID, account_id: row.id, currency: "NOK", ledger_balance_minor: balances.get(row.id) ?? 0, display_balance_minor: balances.get(row.id) ?? 0 })));
    if (url.pathname === "/rest/v1/current_net_worth") return json(route, [{ user_id: USER_ID, currency: "NOK", net_worth_minor: netWorth() }]);
    if (url.pathname === "/rest/v1/categories") return json(route, [{ id: CATEGORY_ID, user_id: USER_ID, name: "Housing", kind: "expense", archived_at: null, sort_order: 10 }]);
    if (url.pathname === "/rest/v1/transactions") return json(route, transactions);
    if (url.pathname === "/rest/v1/transaction_entries") return json(route, []);
    if (url.pathname === "/rest/v1/account_balance_snapshots" && request.method() === "GET") return json(route, snapshots);
    if (url.pathname === "/rest/v1/account_balance_snapshots" && request.method() === "POST") {
      const row = { id: newId(), ...request.postDataJSON() }; snapshots.unshift(row); return json(route, row, 201);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const rpc = url.pathname.split("/").pop();
      const body = request.postDataJSON();
      if (rpc === "create_account") {
        accounts.push(account(SAVINGS_ID, body.p_name, "savings", "liquid")); balances.set(SAVINGS_ID, 0); return json(route, SAVINGS_ID);
      }
      if (rpc === "post_income") return json(route, addTransaction("income", body.p_description, [{ account_id: body.p_account_id, amount_minor: body.p_amount_minor }]));
      if (rpc === "post_expense") return json(route, addTransaction("expense", body.p_description, [{ account_id: body.p_account_id, amount_minor: -body.p_amount_minor }]));
      if (rpc === "post_transfer") return json(route, addTransaction("transfer", body.p_description, [{ account_id: body.p_source_account_id, amount_minor: -body.p_amount_minor }, { account_id: body.p_destination_account_id, amount_minor: body.p_amount_minor }]));
      if (rpc === "reverse_transaction") {
        const original = transactions.find((row) => row.id === body.p_transaction_id)!;
        const entries = (original.transaction_entries as Array<{ account_id: string; amount_minor: number }>).map((entry) => ({ account_id: entry.account_id, amount_minor: -entry.amount_minor }));
        return json(route, addTransaction("reversal", `Reversal: ${original.description}`, entries, String(original.id)));
      }
      if (rpc === "reconcile_account") {
        const current = balances.get(body.p_account_id) ?? 0; const difference = body.p_observed_balance_minor - current;
        if (body.p_create_adjustment && difference) addTransaction("adjustment", "Balance reconciliation", [{ account_id: body.p_account_id, amount_minor: difference }]);
        const snapshot = { id: newId(), user_id: USER_ID, account_id: body.p_account_id, observed_at: body.p_observed_at, balance_minor: body.p_observed_balance_minor, notes: body.p_notes };
        snapshots.unshift(snapshot); return json(route, { snapshot_id: snapshot.id, ledger_balance_minor: current, observed_balance_minor: body.p_observed_balance_minor, difference_minor: difference });
      }
    }
    return json(route, { message: `Unhandled fixture request: ${request.method()} ${url.pathname}` }, 500);
  });
}

test("signed-in Phase 4 money flow uses only invented fixture data", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/money/accounts");
  await expect(page.getByRole("heading", { name: "Accounts", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /Operating Cash/ })).toContainText("11 956,00 kr");

  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "Income" }).click();
  await page.getByLabel("Amount").fill("30000");
  await page.getByLabel("Description").fill("Invented salary");
  await page.getByRole("button", { name: "Post income" }).click();
  await expect(page.getByText("Invented salary")).toBeVisible();

  await page.getByRole("button", { name: "Expense" }).click();
  await page.getByLabel("Amount").fill("10000");
  await page.getByLabel("Description").fill("Invented rent");
  await page.getByRole("button", { name: "Post expense" }).click();
  await expect(page.getByText("Invented rent")).toBeVisible();

  await page.goto("/money/accounts");
  await page.getByLabel("Account name").fill("Fixture Savings");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Fixture Savings")).toBeVisible();
  const worthBeforeTransfer = await page.getByText("Net worth").locator("..").locator("strong").textContent();

  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.getByLabel("Amount").fill("5000");
  await page.getByLabel("To account").selectOption(SAVINGS_ID);
  await page.getByLabel("Description").fill("Invented savings transfer");
  await page.getByRole("button", { name: "Post transfer" }).click();
  await expect(page.getByText("Invented savings transfer")).toBeVisible();
  await page.goto("/money/accounts");
  await expect(page.getByText("Net worth").locator("..").locator("strong")).toHaveText(worthBeforeTransfer!);

  await page.goto("/money/transactions");
  const rent = page.getByText("Invented rent").locator("../..");
  page.once("dialog", (dialog) => dialog.accept());
  await rent.getByRole("button", { name: "Reverse transaction" }).click();
  await expect(page.getByText("Reversal: Invented rent")).toBeVisible();

  await page.goto("/money/accounts");
  await page.getByRole("button", { name: /Operating Cash/ }).click();
  await page.getByLabel("Bank balance", { exact: true }).fill("26200");
  await page.getByLabel("Note").fill("Invented bank snapshot");
  await page.getByRole("button", { name: "Record snapshot" }).click();
  await expect(page.getByText("Invented bank snapshot")).toBeVisible();
  await page.getByLabel("Actual bank balance").fill("26300");
  await page.getByLabel("Create a confirmed adjustment").check();
  await page.getByRole("button", { name: "Create adjustment" }).click();
  await expect(page.getByRole("button", { name: /Operating Cash/ })).toContainText("26 300,00 kr");
});
