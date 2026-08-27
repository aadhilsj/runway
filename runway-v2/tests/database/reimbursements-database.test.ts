import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER = "91919191-9191-4919-8919-919191919191";
const OTHER = "92929292-9292-4929-8929-929292929292";
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
  "20260827000819_add_reimbursement_tracking.sql",
];

let db: PGlite;
let operatingId: string;
let categoryId: string;
let poolId: string;

async function asUser<T>(userId: string, action: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  try { return await action(); } finally { await db.exec("reset role"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema extensions;
  `);
  for (const file of migrations) {
    let sql = await readFile(resolve(process.cwd(), `../supabase/migrations/${file}`), "utf8");
    sql = sql.replace("create extension if not exists pgcrypto with schema extensions;", "-- pre-provisioned");
    await db.exec(sql);
  }
  await db.query("insert into auth.users(id) values($1),($2)", [USER, OTHER]);
  await db.query("insert into public.profiles(user_id,base_currency,timezone) values($1,'NOK','Europe/Oslo'),($2,'NOK','UTC')", [USER, OTHER]);
  operatingId = (await asUser(USER, () => db.query<{ id: string }>(
    "select public.create_account('Operating Cash','asset','checking','NOK',true,'operating','ledger',null,1000000,now(),'Opening','reimbursement-operating') id",
  ))).rows[0]!.id;
  categoryId = (await asUser(USER, () => db.query<{ id: string }>(
    "insert into public.categories(user_id,name,kind) values($1,'Groceries','expense') returning id", [USER],
  ))).rows[0]!.id;
  const itemId = (await asUser(USER, () => db.query<{ id: string }>(
    "insert into public.forecast_items(user_id,kind,expected_date,amount_minor,destination_account_id,label) values($1,'income','2026-09-10',1765700,$2,'Splitwise (incl. May rent)') returning id",
    [USER, operatingId],
  ))).rows[0]!.id;
  poolId = (await asUser(USER, () => db.query<{ id: string }>(
    "select public.convert_forecast_item_to_reimbursement_pool($1) id", [itemId],
  ))).rows[0]!.id;
});

afterAll(async () => db.close());

describe.sequential("linked reimbursements", () => {
  it("converts the existing forecast amount into a non-liquid receivable and transfer", async () => {
    const pool = (await asUser(USER, () => db.query<{ amount: number; kind: string; hidden: boolean }>(`
      select f.amount_minor::bigint amount, f.kind::text kind, a.hidden_from_accounts hidden
      from public.reimbursement_pools p join public.forecast_items f on f.id=p.forecast_item_id
      join public.accounts a on a.id=p.receivable_account_id where p.id=$1
    `, [poolId]))).rows[0]!;
    expect(Number(pool.amount)).toBe(1765700);
    expect(pool.kind).toBe("transfer");
    expect(pool.hidden).toBe(true);
  });

  it("records full cash outflow but only personal spending", async () => {
    const transactionId = (await asUser(USER, () => db.query<{ id: string }>(`
      select public.post_split_expense($1,30000,6000,$2,$3,'2026-08-26T12:00:00Z','Shared groceries',null,'split-groceries') id
    `, [operatingId, poolId, categoryId]))).rows[0]!.id;
    const amounts = (await db.query<{ amount: number }>(
      "select amount_minor::bigint amount from public.transaction_entries where transaction_id=$1 order by amount_minor", [transactionId],
    )).rows.map((row) => Number(row.amount));
    expect(amounts).toEqual([-30000, 6000, 24000]);
    const budget = (await db.query<{ actual: number }>(
      "select actual_minor::bigint actual from public.budget_actuals where user_id=$1 and category_id=$2", [USER, categoryId],
    )).rows[0]!;
    expect(Number(budget.actual)).toBe(24000);
    const forecast = (await db.query<{ amount: number }>(`
      select f.amount_minor::bigint amount from public.reimbursement_pools p join public.forecast_items f on f.id=p.forecast_item_id where p.id=$1
    `, [poolId])).rows[0]!;
    expect(Number(forecast.amount)).toBe(1771700);
  });

  it("records a partial repayment as a net-worth-neutral transfer, never income", async () => {
    const transactionId = (await asUser(USER, () => db.query<{ id: string }>(`
      select public.record_reimbursement($1,$2,10000,'2026-09-10T12:00:00Z',null,'splitwise-partial') id
    `, [poolId, operatingId]))).rows[0]!.id;
    const transaction = (await db.query<{ kind: string }>("select kind::text kind from public.transactions where id=$1", [transactionId])).rows[0]!;
    expect(transaction.kind).toBe("reimbursement");
    const flowEntries = (await db.query<{ count: number }>(`
      select count(*)::int count from public.transaction_entries e join public.accounts a on a.id=e.account_id
      where e.transaction_id=$1 and a.class in ('income','expense')
    `, [transactionId])).rows[0]!;
    expect(flowEntries.count).toBe(0);
    const forecast = (await db.query<{ amount: number }>(`
      select f.amount_minor::bigint amount from public.reimbursement_pools p join public.forecast_items f on f.id=p.forecast_item_id where p.id=$1
    `, [poolId])).rows[0]!;
    expect(Number(forecast.amount)).toBe(1761700);
  });

  it("stores manual total corrections as traceable ledger adjustments", async () => {
    await asUser(USER, () => db.query(
      "select public.adjust_reimbursement_pool($1,1800000,'2026-09-15','Matched Splitwise total','splitwise-correction')", [poolId],
    ));
    const row = (await db.query<{ delta: number; amount: number; date: string }>(`
      select e.delta_minor::bigint delta,f.amount_minor::bigint amount,f.expected_date::text date
      from public.reimbursement_entries e join public.reimbursement_pools p on p.id=e.pool_id
      join public.forecast_items f on f.id=p.forecast_item_id
      where e.pool_id=$1 and e.entry_kind='manual_adjustment'
    `, [poolId])).rows[0]!;
    expect(Number(row.delta)).toBe(38300);
    expect(Number(row.amount)).toBe(1800000);
    expect(row.date).toBe("2026-09-15");
  });

  it("keeps the linked balance correct when a split expense is reversed", async () => {
    const original = (await db.query<{ id: string }>("select id from public.transactions where idempotency_key='split-groceries'")).rows[0]!.id;
    await asUser(USER, () => db.query("select public.reverse_transaction($1,now(),'Correction','reverse-split-groceries')", [original]));
    const outstanding = (await db.query<{ amount: number }>(`
      select sum(delta_minor)::bigint amount from public.reimbursement_entries where pool_id=$1
    `, [poolId])).rows[0]!;
    expect(Number(outstanding.amount)).toBe(1794000);
    const budget = (await db.query<{ actual: number }>(
      "select actual_minor::bigint actual from public.budget_actuals where user_id=$1 and category_id=$2", [USER, categoryId],
    )).rows[0]!;
    expect(Number(budget.actual)).toBe(0);
  });

  it("isolates reimbursement data and mutation RPCs by owner", async () => {
    const visible = await asUser(OTHER, () => db.query("select * from public.reimbursement_pools"));
    expect(visible.rows).toHaveLength(0);
    await expect(asUser(OTHER, () => db.query(
      "select public.record_reimbursement($1,$2,100,now(),null,'cross-owner')", [poolId, operatingId],
    ))).rejects.toThrow(/unavailable/i);
  });
});
