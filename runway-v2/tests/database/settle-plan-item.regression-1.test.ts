import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER = "81818181-8181-4818-8818-818181818181";
const OTHER_USER = "82828282-8282-4828-8828-828282828282";
const migrations = [
  "20260819060132_phase_2_ledger_core.sql",
  "20260819060415_phase_2_view_privileges.sql",
  "20260819060530_phase_2_fk_indexes.sql",
  "20260819063329_phase_3_migration_staging.sql",
  "20260819063626_phase_3_staging_fk_indexes.sql",
  "20260819114938_phase_4_actual_money_workflows.sql",
  "20260819115028_phase_4_fk_indexes.sql",
  "20260819160000_phase_5_forecast_recurrence.sql",
  "20260819190000_phase_6_funds_payday_budgets.sql",
  "20260819190500_phase_6_budget_group_scope_fix.sql",
  "20260819200000_phase_6_1_budget_and_function_cleanup.sql",
  "20260819210000_phase_7_plans_scenarios.sql",
  "20260819210500_phase_7_rpc_exposure_fix.sql",
  "20260824225710_settle_plan_item.sql",
];

let db: PGlite;
let accountId: string;
let planId: string;

async function asUser<T>(userId: string, action: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  try { return await action(); } finally { await db.exec("reset role"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; create schema extensions;");
  for (const file of migrations) {
    let sql = await readFile(resolve(process.cwd(), `../supabase/migrations/${file}`), "utf8");
    sql = sql.replace("create extension if not exists pgcrypto with schema extensions;", "-- pre-provisioned");
    await db.exec(sql);
  }
  await db.query("insert into auth.users(id) values($1),($2)", [USER, OTHER_USER]);
  await db.query("insert into public.profiles(user_id,base_currency,timezone,operating_floor_minor) values($1,'NOK','Europe/Oslo',0),($2,'NOK','UTC',0)", [USER, OTHER_USER]);
  accountId = (await asUser(USER, () => db.query<{ id: string }>("select public.create_account('Operating','asset','checking','NOK',true,'operating','ledger',null,1000000,now(),'Opening','plan-settle-opening') id"))).rows[0]!.id;
  planId = (await db.query<{ id: string }>("insert into public.scenarios(user_id,name,status,comparison_enabled) values($1,'Trip plan','active',true) returning id", [USER])).rows[0]!.id;
});

afterAll(async () => db.close());

describe.sequential("Plan item settlement", () => {
  it("atomically replaces a current Plan expense with Activity and removes its assumption", async () => {
    const changeId = (await db.query<{ id: string }>("insert into public.scenario_changes(user_id,scenario_id,change_type,source_account_id,effective_on,amount_minor,label,sort_order) values($1,$2,'add_one_off_expense',$3,'2026-10-15',250000,'Visa fee',0) returning id", [USER, planId, accountId])).rows[0]!.id;
    const transactionId = (await asUser(USER, () => db.query<{ id: string }>("select public.settle_plan_item($1,null,250000,'2026-10-15T12:00:00Z',$2,null,null,null,'settle-change-expense') id", [changeId, accountId]))).rows[0]!.id;

    expect((await db.query<{ count: number }>("select count(*)::int count from public.scenario_changes where id=$1", [changeId])).rows[0]!.count).toBe(0);
    expect((await db.query<{ notes: string }>("select notes from public.transactions where id=$1", [transactionId])).rows[0]!.notes).toContain("Plan: Trip plan");
    expect((await db.query<{ balance: number }>("select display_balance_minor::bigint balance from public.account_balances where account_id=$1", [accountId])).rows[0]!.balance).toBe(750000);
  });

  it("settles an older Plan-linked income row and hides it from both Forecast and Plan", async () => {
    const itemId = (await db.query<{ id: string }>("insert into public.forecast_items(user_id,kind,destination_account_id,expected_date,amount_minor,label,scenario_id,status) values($1,'income',$2,'2026-10-20',150000,'Plan rebate',$3,'expected') returning id", [USER, accountId, planId])).rows[0]!.id;
    await asUser(USER, () => db.query("select public.settle_plan_item(null,$1,150000,'2026-10-20T12:00:00Z',null,$2,null,'Original note','settle-legacy-income')", [itemId, accountId]));

    const item = (await db.query<{ status: string; matched_transaction_id: string | null }>("select status,matched_transaction_id from public.forecast_items where id=$1", [itemId])).rows[0]!;
    expect(item.status).toBe("matched");
    expect(item.matched_transaction_id).toBeTruthy();
    expect((await db.query<{ balance: number }>("select display_balance_minor::bigint balance from public.account_balances where account_id=$1", [accountId])).rows[0]!.balance).toBe(900000);
  });

  it("rolls back without deleting the Plan item when Activity cannot be posted", async () => {
    const changeId = (await db.query<{ id: string }>("insert into public.scenario_changes(user_id,scenario_id,change_type,source_account_id,effective_on,amount_minor,label,sort_order) values($1,$2,'add_one_off_expense',$3,'2026-11-01',10000,'Invalid account test',1) returning id", [USER, planId, accountId])).rows[0]!.id;
    await expect(asUser(USER, () => db.query("select public.settle_plan_item($1,null,10000,now(),$2,null,null,null,'settle-invalid')", [changeId, "82828282-8282-4828-8828-828282828282"]))).rejects.toThrow();
    expect((await db.query<{ count: number }>("select count(*)::int count from public.scenario_changes where id=$1", [changeId])).rows[0]!.count).toBe(1);
    expect((await db.query<{ count: number }>("select count(*)::int count from public.transactions where idempotency_key='settle-invalid'")).rows[0]!.count).toBe(0);
  });

  it("does not let another user settle the Plan item", async () => {
    const changeId = (await db.query<{ id: string }>("select id from public.scenario_changes where label='Invalid account test'")).rows[0]!.id;
    await expect(asUser(OTHER_USER, () => db.query("select public.settle_plan_item($1,null,10000,now(),null,null,null,null,'other-user')", [changeId]))).rejects.toThrow(/not found/i);
  });
});
