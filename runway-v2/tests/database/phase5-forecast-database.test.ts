import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER_A = "88888888-8888-4888-8888-888888888888";
const USER_B = "99999999-9999-4999-8999-999999999999";
let db: PGlite; let accountA: string; let accountB: string; let transactionA: string;
const files = ["20260819060132_phase_2_ledger_core.sql", "20260819060415_phase_2_view_privileges.sql", "20260819060530_phase_2_fk_indexes.sql", "20260819063329_phase_3_migration_staging.sql", "20260819063626_phase_3_staging_fk_indexes.sql", "20260819114938_phase_4_actual_money_workflows.sql", "20260819115028_phase_4_fk_indexes.sql", "20260819160000_phase_5_forecast_recurrence.sql", "20260819190000_phase_6_funds_payday_budgets.sql", "20260819190500_phase_6_budget_group_scope_fix.sql", "20260819200000_phase_6_1_budget_and_function_cleanup.sql"];

async function asUser<T>(userId: string, action: () => Promise<T>): Promise<T> { await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]); try { return await action(); } finally { await db.exec("reset role"); } }

beforeAll(async () => {
  db = new PGlite(); await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create schema extensions;`);
  for (const file of files) { let sql = await readFile(resolve(process.cwd(), `../supabase/migrations/${file}`), "utf8"); sql = sql.replace("create extension if not exists pgcrypto with schema extensions;", "-- pre-provisioned"); await db.exec(sql); }
  await db.query("insert into auth.users(id) values($1),($2)", [USER_A, USER_B]);
  await db.query("insert into public.profiles(user_id,base_currency,timezone) values($1,'NOK','Europe/Oslo'),($2,'NOK','UTC')", [USER_A, USER_B]);
  accountA = (await asUser(USER_A, () => db.query<{ id: string }>("select public.create_account('Operating','asset','checking','NOK',true,'operating','ledger',null,1000000,now(),'Opening','phase5-a') id"))).rows[0]!.id;
  accountB = (await asUser(USER_B, () => db.query<{ id: string }>("select public.create_account('Other','asset','checking','NOK',true,'operating','ledger',null,1000000,now(),'Opening','phase5-b') id"))).rows[0]!.id;
  transactionA = (await asUser(USER_A, () => db.query<{ id: string }>("select public.post_income($1,50000,null,now(),'Actual income',null,null,'phase5-income') id", [accountA]))).rows[0]!.id;
});
afterAll(async () => db.close());

describe.sequential("Phase 5 forecast database integrity", () => {
  it("enables RLS and blocks cross-owner recurrence references", async () => {
    const security = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('recurring_rules','recurring_occurrences') order by relname");
    expect(security.rows).toHaveLength(2); expect(security.rows.every((row) => row.relrowsecurity)).toBe(true);
    await expect(asUser(USER_A, () => db.query("insert into public.recurring_rules(user_id,kind,label,source_account_id,amount_minor,frequency,day_of_month,start_on) values($1,'expense','Bad owner',$2,1000,'monthly',1,'2026-09-01')", [USER_A, accountB]))).rejects.toThrow();
  });

  it("stores rules dynamically and only materializes explicit exceptions", async () => {
    const rule = await asUser(USER_A, () => db.query<{ id: string }>("insert into public.recurring_rules(user_id,kind,label,destination_account_id,amount_minor,frequency,day_of_month,start_on) values($1,'income','Fixture salary',$2,100000,'monthly',31,'2026-08-31') returning id", [USER_A, accountA]));
    const before = await db.query<{ count: number }>("select count(*)::int count from public.recurring_occurrences where recurring_rule_id=$1", [rule.rows[0]!.id]); expect(before.rows[0]!.count).toBe(0);
    await asUser(USER_A, () => db.query("insert into public.recurring_occurrences(user_id,recurring_rule_id,occurrence_date,status) values($1,$2,'2026-09-30','skipped')", [USER_A, rule.rows[0]!.id]));
    const after = await db.query<{ count: number }>("select count(*)::int count from public.recurring_occurrences where recurring_rule_id=$1", [rule.rows[0]!.id]); expect(after.rows[0]!.count).toBe(1);
  });

  it("matches a posted actual while preserving expected snapshots", async () => {
    const item = await asUser(USER_A, () => db.query<{ id: string }>("insert into public.forecast_items(user_id,kind,expected_date,amount_minor,destination_account_id,label) values($1,'income','2026-09-01',60000,$2,'Expected income') returning id", [USER_A, accountA]));
    await asUser(USER_A, () => db.query("select public.match_forecast_item($1,$2)", [item.rows[0]!.id, transactionA]));
    const matched = await db.query<{ status: string; amount: number; expected_date: string }>("select status::text,expected_amount_minor_snapshot::int amount,expected_date_snapshot::text expected_date from public.forecast_items where id=$1", [item.rows[0]!.id]);
    expect(matched.rows[0]).toEqual({ status: "matched", amount: 60000, expected_date: "2026-09-01" });
  });

  it("rejects draft, cross-owner, and duplicate actual matches", async () => {
    const second = await asUser(USER_A, () => db.query<{ id: string }>("insert into public.forecast_items(user_id,kind,expected_date,amount_minor,destination_account_id,label) values($1,'income','2026-09-02',50000,$2,'Second expected') returning id", [USER_A, accountA]));
    await expect(asUser(USER_A, () => db.query("select public.match_forecast_item($1,$2)", [second.rows[0]!.id, transactionA]))).rejects.toThrow(/already matched/i);
    const otherActual = (await asUser(USER_B, () => db.query<{ id: string }>("select public.post_income($1,10000,null,now(),'Other actual',null,null,'other-income') id", [accountB]))).rows[0]!.id;
    await expect(asUser(USER_A, () => db.query("select public.match_forecast_item($1,$2)", [second.rows[0]!.id, otherActual]))).rejects.toThrow(/posted owned/i);
  });
});
