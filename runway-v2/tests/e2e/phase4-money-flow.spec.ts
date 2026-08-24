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

export async function installFixtureBackend(page: Page) {
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
  const recurringRules: Array<Record<string, unknown>> = [];
  const forecastItems: Array<Record<string, unknown>> = [{ id: "forecast-scenario", user_id: USER_ID, kind: "expense", expected_date: "2026-10-15", amount_minor: 250000, source_account_id: OPERATING_ID, destination_account_id: null, category_id: CATEGORY_ID, label: "Invented scenario cost", notes: null, confidence: "expected", status: "expected", scenario_id: "scenario-fixture", default_sort_order: null }];
  const scenarios: Array<Record<string, unknown>> = [{ id: "scenario-fixture", user_id: USER_ID, name: "Invented plan", description: "Fixture", status: "active", comparison_enabled: false, legacy_source_id: "legacy-fixture", migration_metadata: {}, start_on: null, end_on: null, archived_at: null, applied_at: null, created_at: now, updated_at: now }];
  const scenarioChanges: Array<Record<string, unknown>> = [];
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
    if (url.pathname === "/rest/v1/profiles" && request.method() === "GET") return json(route, { user_id: USER_ID, base_currency: "NOK", timezone: "Europe/Oslo", operating_floor_minor: 900000, forecast_horizon_months: 12, safety_window_days: 30, schema_version: 7 });
    if (url.pathname === "/rest/v1/profiles" && request.method() === "PATCH") return json(route, []);
    if (url.pathname === "/rest/v1/account_balances") return json(route, accounts.map((row) => ({ user_id: USER_ID, account_id: row.id, currency: "NOK", ledger_balance_minor: balances.get(row.id) ?? 0, display_balance_minor: balances.get(row.id) ?? 0 })));
    if (url.pathname === "/rest/v1/current_net_worth") return json(route, [{ user_id: USER_ID, currency: "NOK", net_worth_minor: netWorth() }]);
    if (url.pathname === "/rest/v1/categories") return json(route, [{ id: CATEGORY_ID, user_id: USER_ID, name: "Housing", kind: "expense", archived_at: null, sort_order: 10 }]);
    if (url.pathname === "/rest/v1/transactions") return json(route, transactions);
    if (url.pathname === "/rest/v1/forecast_items" && request.method() === "GET") return json(route, forecastItems);
    if (url.pathname === "/rest/v1/funds" && request.method() === "GET") return json(route, []);
    if (url.pathname === "/rest/v1/fund_balances" && request.method() === "GET") return json(route, []);
    if (url.pathname === "/rest/v1/portfolio_value_snapshots" && request.method() === "GET") return json(route, []);
    if (["/rest/v1/goals","/rest/v1/fund_movements","/rest/v1/allocation_plans","/rest/v1/allocation_plan_items","/rest/v1/fund_backing_summary","/rest/v1/scenario_applications","/rest/v1/budget_periods","/rest/v1/budget_lines","/rest/v1/budget_groups","/rest/v1/budget_group_categories","/rest/v1/budget_actuals","/rest/v1/budget_commitments"].includes(url.pathname)) return json(route, []);
    if (url.pathname === "/rest/v1/recurring_rules" && request.method() === "GET") return json(route, recurringRules);
    if (url.pathname === "/rest/v1/recurring_rules" && request.method() === "POST") { recurringRules.push({ id: newId(), active: true, archived_at: null, confidence: "expected", scenario_id: null, default_sort_order: null, ...request.postDataJSON() }); return json(route, [], 201); }
    if (url.pathname === "/rest/v1/recurring_rules" && request.method() === "PATCH") { const id = url.searchParams.get("id")?.replace("eq.", ""); const rule = recurringRules.find((row) => row.id === id); if (rule) Object.assign(rule, request.postDataJSON()); return json(route, []); }
    if (url.pathname === "/rest/v1/recurring_occurrences") return json(route, []);
    if (url.pathname === "/rest/v1/scenarios" && request.method() === "GET") return json(route, scenarios);
    if (url.pathname === "/rest/v1/scenarios" && request.method() === "POST") { const row={id:newId(),legacy_source_id:null,migration_metadata:{},comparison_enabled:false,start_on:null,end_on:null,archived_at:null,applied_at:null,created_at:now,updated_at:now,...request.postDataJSON()};scenarios.push(row);return json(route,row,201); }
    if (url.pathname === "/rest/v1/scenarios" && request.method() === "PATCH") { const id=url.searchParams.get("id")?.replace("eq.","");const row=scenarios.find(item=>item.id===id);if(row)Object.assign(row,request.postDataJSON(),{updated_at:now});return json(route,[]); }
    if (url.pathname === "/rest/v1/scenario_changes" && request.method() === "GET") return json(route,scenarioChanges);
    if (url.pathname === "/rest/v1/scenario_changes" && request.method() === "POST") { const row={id:newId(),created_at:now,updated_at:now,...request.postDataJSON()};scenarioChanges.push(row);return json(route,row,201); }
    if (url.pathname === "/rest/v1/scenario_changes" && request.method() === "PATCH") { const id=url.searchParams.get("id")?.replace("eq.","");const row=scenarioChanges.find(item=>item.id===id);if(row)Object.assign(row,request.postDataJSON(),{updated_at:now});return json(route,[]); }
    if (url.pathname === "/rest/v1/scenario_changes" && request.method() === "DELETE") { const id=url.searchParams.get("id")?.replace("eq.","");const index=scenarioChanges.findIndex(item=>item.id===id);if(index>=0)scenarioChanges.splice(index,1);return json(route,[]); }
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
      if (rpc === "post_income") return json(route, addTransaction("income", body.p_description, [{ account_id: body.p_destination_account_id, amount_minor: body.p_amount_minor }]));
      if (rpc === "post_expense") return json(route, addTransaction("expense", body.p_description, [{ account_id: body.p_source_account_id, amount_minor: -body.p_amount_minor }]));
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
      if (rpc === "preview_plan_application") { const plan=scenarios.find(item=>item.id===body.p_scenario_id)!;const changes=scenarioChanges.filter(item=>item.scenario_id===body.p_scenario_id);return json(route,{scenario_id:plan.id,name:plan.name,confirmation_token:"fixture-preview-token",change_count:changes.length,changes:changes.map(item=>({id:item.id,type:item.change_type,label:item.label,effective_on:item.effective_on,amount_minor:item.amount_minor})),requires_confirmation:true,actual_transactions_created:0}); }
      if (rpc === "apply_plan_to_base") { const plan=scenarios.find(item=>item.id===body.p_scenario_id)!;Object.assign(plan,{status:"applied",archived_at:now,applied_at:now,comparison_enabled:false});return json(route,{scenario_id:plan.id,change_count:scenarioChanges.filter(item=>item.scenario_id===plan.id).length,actual_transactions_created:0,already_applied:false}); }
    }
    return json(route, { message: `Unhandled fixture request: ${request.method()} ${url.pathname}` }, 500);
  });
}

test("signed-in Phase 4 money flow uses only invented fixture data", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/money/accounts");
  await expect(page.getByRole("heading", { name: "Accounts", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /Operating Cash/ })).toContainText("11 956 kr");

  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByRole("button", { name: "Income" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("30000");
  await page.getByLabel("Description", { exact: true }).fill("Invented salary");
  await page.getByRole("button", { name: "Post income" }).click();
  await expect(page.getByText("Invented salary")).toBeVisible();

  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByRole("button", { name: "Expense", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("10000");
  await page.getByLabel("Description", { exact: true }).fill("Invented rent");
  await page.getByRole("button", { name: "Post expense" }).click();
  await expect(page.getByText("Invented rent")).toBeVisible();

  await page.goto("/money/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Account name").fill("Fixture Savings");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Fixture Savings")).toBeVisible();
  const worthBeforeTransfer = await page.getByText("Net worth").locator("..").locator("strong").textContent();

  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("5000");
  await page.getByLabel("To account").selectOption(SAVINGS_ID);
  await page.getByLabel("Description", { exact: true }).fill("Invented savings transfer");
  await page.getByRole("button", { name: "Post transfer" }).click();
  await expect(page.getByText("Invented savings transfer")).toBeVisible();
  await page.goto("/money/accounts");
  await expect(page.getByText("Net worth").locator("..").locator("strong")).toHaveText(worthBeforeTransfer!);

  await page.goto("/money/transactions");
  const rent = page.getByText("Invented rent").locator("../..");
  await rent.getByRole("button", { name: /Reverse transaction/ }).click();
  await expect(page.getByRole("heading", { name: "Reverse transaction?" })).toBeVisible();
  await page.getByRole("button", { name: "Reverse transaction", exact: true }).click();
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
  await expect(page.getByRole("button", { name: /Operating Cash/ })).toContainText("26 300 kr");
  await page.goto("/money/transactions");
  const reconciliation = page.locator(".transaction-row").filter({ hasText: "Balance reconciliation" });
  await expect(reconciliation.locator(".transaction-icon")).toHaveText("−");
  await expect(reconciliation.locator(".transaction-amount strong")).toContainText("−");
});

test("creates recurring plans and projects horizon and scenario changes", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/settings/recurring");
  await expect(page.getByRole("heading", { name: "Recurring rules", level: 1 })).toBeVisible();
  await page.getByLabel("Type").selectOption("income"); await page.getByLabel("Label").fill("Invented recurring salary"); await page.getByLabel("Amount").fill("30000"); await page.getByLabel("Starts").fill("2026-09-01"); await page.getByLabel("To account").selectOption(OPERATING_ID); await page.getByRole("button", { name: "Create recurring rule" }).click();
  await expect(page.getByText("Invented recurring salary")).toBeVisible();
  await page.getByLabel("Type").selectOption("expense"); await page.getByLabel("Label").fill("Invented recurring rent"); await page.getByLabel("Amount").fill("10000"); await page.getByLabel("Starts").fill("2026-09-02"); await page.getByLabel("From account").selectOption(OPERATING_ID); await page.getByRole("button", { name: "Create recurring rule" }).click();
  await expect(page.getByText("Invented recurring rent")).toBeVisible();
  await page.goto("/forecast"); await expect(page.getByText("Invented recurring salary").first()).toBeVisible(); await expect(page.getByText("Invented scenario cost")).toHaveCount(0);
  await page.getByRole("button", { name: "24 months" }).click(); await page.getByRole("checkbox", { name: "Invented plan" }).check(); await expect(page.getByText("Invented scenario cost")).toBeVisible(); await expect(page.getByLabel("Projected operating and liquid cash chart")).toBeVisible();
  const recurringRow = page.locator(".forecast-row").filter({ hasText: "Invented recurring salary" }).first();
  await expect(recurringRow.getByRole("link", { name: "Post actual" })).toBeVisible();
  await recurringRow.getByText("More").click();
  await expect(recurringRow.getByRole("button", { name: "Skip this occurrence" })).toBeVisible();
  await expect(recurringRow.getByLabel("Match recurring Invented recurring salary")).toBeVisible();
});

test("creates, compares, previews, cancels, and confirms a what-if Plan", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/plans");
  await page.getByRole("button",{name:"Create plan"}).click();
  await page.getByLabel("Name").fill("Brazil Trip");
  await page.getByLabel(/Description/).fill("Invented E2E fixture");
  await page.getByRole("button",{name:"Save plan"}).click();
  const card=page.locator("article").filter({hasText:"Brazil Trip"});
  await expect(card).toBeVisible();
  await card.getByRole("link",{name:/Edit/}).click();
  await page.getByLabel("Label").fill("Trip cost");
  await page.getByLabel("Amount").fill("17000");
  await page.getByLabel(/Effective date/).fill("2026-10-01");
  await page.getByLabel(/From account/).selectOption(OPERATING_ID);
  await page.getByRole("button",{name:"Add assumption"}).click();
  await expect(page.getByText("Trip cost").first()).toBeVisible();

  await page.goto("/plans");
  const updated=page.locator("article").filter({hasText:"Brazil Trip"});
  const detailHref=await updated.getByRole("link",{name:/Edit/}).getAttribute("href") ?? "/plans";
  await updated.getByRole("checkbox",{name:"Compare"}).click();
  await expect(updated.getByRole("checkbox",{name:"Compare"})).toBeChecked();
  await page.getByRole("link",{name:"Compare plans"}).click();
  await expect(page.getByRole("heading",{name:"Base versus what-if"})).toBeVisible();
  await expect(page.getByLabel("Base and selected Plan operating cash chart")).toBeVisible();
  await expect(page.getByText("Brazil Trip").first()).toBeVisible();

  await page.goto(detailHref);
  await page.getByRole("button",{name:"Preview Apply to Base"}).click();
  await expect(page.getByText(/0 actual transactions/)).toBeVisible();
  await page.getByRole("button",{name:"Cancel"}).click();
  await expect(page.getByRole("button",{name:"Confirm Apply to Base"})).toHaveCount(0);
  await page.getByRole("button",{name:"Preview Apply to Base"}).click();
  await page.getByRole("button",{name:"Confirm Apply to Base"}).click();
  await expect(page.getByText(/No actual transaction was created/)).toBeVisible();
});

test("renders the Phase 8 cockpit and authoritative analytics without demo data",async({page})=>{
  await installFixtureBackend(page);
  await page.goto("/overview");
  await expect(page.getByRole("heading",{name:"Overview",level:1})).toBeVisible();
  await expect(page.getByText("Safe to spend")).toBeVisible();
  await expect(page.getByText("Total cash")).toBeVisible();
  await expect(page.getByText("No operating-floor breach projected")).toBeVisible();
  await page.getByRole("link",{name:/Open analytics/}).click();
  await expect(page.getByRole("heading",{name:"Analytics",level:1})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Monthly cash flow"})).toBeVisible();
  await expect(page.getByText(/No pre-cutover values/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:"Analytics",level:1})).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("captures the Phase 10.5 desktop visual audit", async ({ page }) => {
  const output = process.env.RUNWAY_SCREENSHOT_DIR;
  test.skip(!output, "Set RUNWAY_SCREENSHOT_DIR to capture the visual audit.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFixtureBackend(page);
  const routes = [
    ["overview", "/overview", "Safe to spend"],
    ["forecast", "/forecast", "Cash runway"],
    ["analytics", "/analytics", "Monthly cash flow"],
    ["transactions", "/money/transactions", "Posted transactions"],
    ["accounts", "/money/accounts", "Your accounts"],
    ["budgets", "/money/budgets", "Budget lines"],
    ["funds", "/funds", "Review payday plan"],
    ["investments", "/investments", "No investment accounts yet"],
    ["plans", "/plans", "What you are exploring"],
  ] as const;
  for (const [name, route, readyText] of routes) {
    await page.goto(route);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText(readyText, { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
  }
});

test("keeps the polished desktop routes collision-free across supported widths", async ({ page }) => {
  await installFixtureBackend(page);
  const viewports = [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1512, height: 982 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1080 },
  ];
  const routes = ["/overview", "/forecast", "/analytics", "/money/transactions", "/money/accounts", "/money/budgets", "/funds", "/investments", "/plans"];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} at ${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(1);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/money/accounts");
  const content = page.locator(".content");
  const before = await content.boundingBox();
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const after = await content.boundingBox();
  expect(after?.x).toBe(before?.x);
  expect(after?.width).toBe(before?.width);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

async function installPhase10SimplificationFixture(page: Page) {
  await installFixtureBackend(page);
  const fundId = "66666666-6666-4666-8666-666666666666";
  const items: Array<Record<string, unknown>> = [
    { id: "salary-plan", user_id: USER_ID, kind: "income", expected_date: "2026-08-22", amount_minor: 2_300_000, source_account_id: null, destination_account_id: OPERATING_ID, category_id: null, label: "Expected salary", notes: null, confidence: "expected", status: "expected", scenario_id: null, default_sort_order: null, legacy_source_id: "legacy-salary" },
    { id: "phone-plan", user_id: USER_ID, kind: "expense", expected_date: "2026-08-22", amount_minor: 56_800, source_account_id: OPERATING_ID, destination_account_id: null, category_id: null, label: "Phone", notes: null, confidence: "expected", status: "expected", scenario_id: null, default_sort_order: null, legacy_source_id: "legacy-phone" },
  ];
  const fund = { id: fundId, user_id: USER_ID, backing_account_id: OPERATING_ID, name: "Emergency", purpose_key: "emergency", currency: "NOK", color: null, icon: null, sort_order: 1, active: true };
  const goal = { id: "goal-fixture", fund_id: fundId, name: "Emergency goal", target_minor: 4_500_000, preferred_balance_minor: null, cap_minor: null, preferred_contribution_minor: 500_000, floor_minor: null, target_date: null, status: "active", is_primary: true };
  const plan = { id: "payday-fixture", name: "Payday plan", trigger_kind: "payday", source_account_id: OPERATING_ID, active: true, is_default: true };
  const planItem = { id: "payday-item", plan_id: plan.id, label: "Emergency", destination_type: "fund", destination_fund_id: fundId, destination_account_id: null, amount_minor: 500_000, mode: "recommended", priority: 1, stop_basis: "target", activation_source_item_id: null, active: true, starts_on: null, ends_on: null };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === "/rest/v1/forecast_items" && request.method() === "GET") return json(route, items);
    if (path === "/rest/v1/forecast_items" && request.method() === "PATCH") { const item = items.find((row) => row.id === url.searchParams.get("id")?.replace("eq.", "")); if (item) Object.assign(item, request.postDataJSON()); return json(route, []); }
    if (path === "/rest/v1/funds") return json(route, [fund]);
    if (path === "/rest/v1/fund_balances") return json(route, [{ fund_id: fundId, backing_account_id: OPERATING_ID, balance_minor: 0, currency: "NOK" }]);
    if (path === "/rest/v1/goals") return json(route, [goal]);
    if (path === "/rest/v1/allocation_plans") return json(route, [plan]);
    if (path === "/rest/v1/allocation_plan_items") return json(route, [planItem]);
    if (path === "/rest/v1/fund_backing_summary") return json(route, [{ account_id: OPERATING_ID, account_name: "Operating Cash", account_balance_minor: 1_195_600, allocated_minor: 0, unallocated_minor: 1_195_600, backing_valid: true }]);
    if (["/rest/v1/fund_movements", "/rest/v1/scenario_applications"].includes(path)) return json(route, []);
    return route.fallback();
  });
}

test("planned salary stays out of safe-to-spend until it is received", async ({ page }) => {
  await installPhase10SimplificationFixture(page); await page.goto("/overview");
  await expect(page.locator(".position-grid article").filter({ hasText: "Safe to spend" })).toContainText("2 388 kr");
  await page.goto("/money/transactions"); await page.getByRole("button", { name: "Add transaction" }).click(); await page.getByRole("button", { name: "Income" }).click();
  await page.getByLabel("Amount").fill("23000"); await page.getByLabel("Description").fill("Salary received"); await page.getByRole("button", { name: "Post income" }).click(); await expect(page.getByText("Salary received")).toBeVisible();
  await page.goto("/overview"); await page.reload(); await expect(page.locator(".position-grid article").filter({ hasText: "Safe to spend" })).toContainText("25 388 kr");
});

test("forecast assumptions are traceable, editable, and use display currency", async ({ page }) => {
  await installPhase10SimplificationFixture(page); await page.goto("/forecast");
  await expect(page.getByText("Planned income · next 12 months")).toBeVisible();
  await page.getByRole("link", { name: "Review income →" }).click(); await expect(page.getByText("Expected salary")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click(); await page.getByLabel("Amount").fill("24000"); await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByText("24 000 kr", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Spending" }).click(); await expect(page.getByText("Phone")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click(); await page.getByLabel("Amount").fill("600"); await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByText("600 kr", { exact: false }).first()).toBeVisible();
  await page.goto("/funds/payday"); const amount = page.getByLabel("Emergency amount"); await expect(amount).toHaveValue("2356"); await amount.fill("2000"); await expect(amount).toHaveValue("2000");
  await page.goto("/money/transactions"); await expect(page.getByText(/Record money after it moves/)).toBeVisible();
  await page.goto("/money/accounts"); await expect(page.getByText(/real balance of each bank/)).toBeVisible();
  await page.goto("/funds"); await expect(page.getByText(/Give part of your cash a job/)).toBeVisible();
});

test("captures the Phase 10.6 simplified product surfaces", async ({ page }) => {
  const output = process.env.RUNWAY_PHASE10_6_SCREENSHOT_DIR; test.skip(!output, "Set RUNWAY_PHASE10_6_SCREENSHOT_DIR to capture the audit.");
  await page.setViewportSize({ width: 1440, height: 900 }); await installPhase10SimplificationFixture(page);
  const capture = async (name: string, path: string, ready: string) => { await page.goto(path); await expect(page.getByText(ready, { exact: false }).first()).toBeVisible(); await page.screenshot({ path: `${output}/${name}.png`, fullPage: false }); };
  await capture("overview", "/overview", "Total cash"); await capture("forecast-top", "/forecast", "Your cash over the next 12 months");
  await capture("assumptions-income", "/forecast/assumptions?type=income&horizon=12", "Expected salary"); await capture("assumptions-spending", "/forecast/assumptions?type=expense&horizon=12", "Phone");
  await page.goto("/forecast"); await page.getByRole("heading", { name: "Upcoming timeline" }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/forecast-timeline.png`, fullPage: false });
  await capture("payday", "/funds/payday", "Available to split"); await capture("funds", "/funds", "Emergency");
  await capture("activity", "/money/transactions", "Activity"); await capture("accounts", "/money/accounts", "Your accounts"); await capture("sidebar", "/overview", "Total cash");
});
