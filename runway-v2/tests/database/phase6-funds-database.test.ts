import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const files = ["20260819060132_phase_2_ledger_core.sql","20260819060415_phase_2_view_privileges.sql","20260819060530_phase_2_fk_indexes.sql",
  "20260819063329_phase_3_migration_staging.sql","20260819063626_phase_3_staging_fk_indexes.sql","20260819114938_phase_4_actual_money_workflows.sql",
  "20260819115028_phase_4_fk_indexes.sql","20260819160000_phase_5_forecast_recurrence.sql","20260819190000_phase_6_funds_payday_budgets.sql","20260819190500_phase_6_budget_group_scope_fix.sql"];
let db: PGlite; let accountA: string; let accountB: string; let fundA: string; let fund2A: string; let categoryA: string; let planA: string; let itemA: string;
async function asUser<T>(userId: string, action: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[userId]);
  try { return await action(); } finally { await db.exec("reset role"); }
}
beforeAll(async () => {
  db=new PGlite(); await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create schema extensions;`);
  for(const file of files){ let sql=await readFile(resolve(process.cwd(),`../supabase/migrations/${file}`),"utf8"); sql=sql.replace("create extension if not exists pgcrypto with schema extensions;","-- pre-provisioned"); await db.exec(sql); }
  await db.query("insert into auth.users(id) values($1),($2)",[USER_A,USER_B]);
  await db.query("insert into public.profiles(user_id,base_currency,timezone,operating_floor_minor,safety_window_days) values($1,'NOK','Europe/Oslo',900000,30),($2,'NOK','UTC',0,30)",[USER_A,USER_B]);
  accountA=(await asUser(USER_A,()=>db.query<{id:string}>("select public.create_account('Operating','asset','checking','NOK',true,'operating','ledger',null,2000000,now(),'Opening','p6-a') id"))).rows[0]!.id;
  accountB=(await asUser(USER_B,()=>db.query<{id:string}>("select public.create_account('Other','asset','checking','NOK',true,'operating','ledger',null,1000000,now(),'Opening','p6-b') id"))).rows[0]!.id;
  categoryA=(await db.query<{id:string}>("insert into public.categories(user_id,name,kind) values($1,'Travel','expense') returning id",[USER_A])).rows[0]!.id;
  fundA=(await asUser(USER_A,()=>db.query<{id:string}>("insert into public.funds(user_id,backing_account_id,name,purpose_key,currency) values($1,$2,'Emergency','emergency','NOK') returning id",[USER_A,accountA]))).rows[0]!.id;
  fund2A=(await asUser(USER_A,()=>db.query<{id:string}>("insert into public.funds(user_id,backing_account_id,name,purpose_key,currency) values($1,$2,'Travel','travel','NOK') returning id",[USER_A,accountA]))).rows[0]!.id;
  planA=(await asUser(USER_A,()=>db.query<{id:string}>("insert into public.allocation_plans(user_id,name,source_account_id,is_default) values($1,'Payday',$2,true) returning id",[USER_A,accountA]))).rows[0]!.id;
  itemA=(await asUser(USER_A,()=>db.query<{id:string}>("insert into public.allocation_plan_items(user_id,plan_id,label,destination_type,destination_fund_id,amount_minor,priority) values($1,$2,'Emergency','fund',$3,500000,1) returning id",[USER_A,planA,fundA]))).rows[0]!.id;
});
afterAll(async()=>db.close());

describe.sequential("Phase 6 fund persistence",()=>{
  it("allocates and releases virtually without changing net worth",async()=>{
    const before=(await db.query<{n:number}>("select net_worth_minor::int n from public.current_net_worth where user_id=$1",[USER_A])).rows[0]!.n;
    await asUser(USER_A,()=>db.query("select public.allocate_to_fund($1,500000,now(),'Seed','alloc-1')",[fundA]));
    await asUser(USER_A,()=>db.query("select public.allocate_to_fund($1,500000,now(),'Seed','alloc-1')",[fundA]));
    expect((await db.query<{n:number}>("select balance_minor::int n from public.fund_balances where fund_id=$1",[fundA])).rows[0]!.n).toBe(500000);
    expect((await db.query<{n:number}>("select count(*)::int n from public.fund_movements where fund_id=$1",[fundA])).rows[0]!.n).toBe(1);
    await asUser(USER_A,()=>db.query("select public.release_from_fund($1,100000,now(),'Release','release-1')",[fundA]));
    expect((await db.query<{n:number}>("select balance_minor::int n from public.fund_balances where fund_id=$1",[fundA])).rows[0]!.n).toBe(400000);
    expect((await db.query<{n:number}>("select net_worth_minor::int n from public.current_net_worth where user_id=$1",[USER_A])).rows[0]!.n).toBe(before);
  });

  it("rejects over-allocation and cross-owner backing",async()=>{
    await expect(asUser(USER_A,()=>db.query("select public.allocate_to_fund($1,99999999,now(),'Too much','alloc-bad')",[fundA]))).rejects.toThrow(/operating floor/i);
    await expect(asUser(USER_B,()=>db.query("insert into public.funds(user_id,backing_account_id,name,currency) values($1,$2,'Bad','NOK')",[USER_B,accountA]))).rejects.toThrow();
  });

  it("transfers between funds without changing total allocated cash",async()=>{
    await asUser(USER_A,()=>db.query("select public.transfer_between_funds($1,$2,100000,now(),'Rebalance','transfer-1')",[fundA,fund2A]));
    const balances=await db.query<{fund_id:string;n:number}>("select fund_id,balance_minor::int n from public.fund_balances where fund_id in($1,$2) order by fund_id",[fundA,fund2A]);
    expect(balances.rows.reduce((sum,row)=>sum+row.n,0)).toBe(400000);
  });

  it("posts a fund spend once to the actual ledger and fund ledger",async()=>{
    await asUser(USER_A,()=>db.query("select public.post_fund_spend($1,$2,50000,$3,now(),'Train','Rail',null,'spend-1')",[fund2A,accountA,categoryA]));
    expect((await db.query<{n:number}>("select count(*)::int n from public.transactions where user_id=$1 and kind='expense'",[USER_A])).rows[0]!.n).toBe(1);
    expect((await db.query<{n:number}>("select balance_minor::int n from public.fund_balances where fund_id=$1",[fund2A])).rows[0]!.n).toBe(50000);
  });

  it("executes confirmed fund recommendations atomically and idempotently",async()=>{
    const approved=JSON.stringify([{plan_item_id:itemA,recommended_minor:100000,approved_minor:100000}]);
    const first=await asUser(USER_A,()=>db.query<{id:string}>("select public.execute_payday_allocation($1,null,$2::jsonb,'payday-1') id",[planA,approved]));
    const second=await asUser(USER_A,()=>db.query<{id:string}>("select public.execute_payday_allocation($1,null,$2::jsonb,'payday-1') id",[planA,approved]));
    expect(second.rows[0]!.id).toBe(first.rows[0]!.id);
    expect((await db.query<{n:number}>("select count(*)::int n from public.payday_executions where user_id=$1",[USER_A])).rows[0]!.n).toBe(1);
  });

  it("derives budget actuals only from posted category expenses",async()=>{
    const actual=await asUser(USER_A,()=>db.query<{n:number}>("select actual_minor::int n from public.budget_actuals where user_id=$1 and category_id=$2",[USER_A,categoryA]));
    expect(actual.rows[0]!.n).toBe(50000);
  });
});
