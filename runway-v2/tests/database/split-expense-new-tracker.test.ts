import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER = "93939393-9393-4939-8939-939393939393";
const OTHER = "94949494-9494-4949-8949-949494949494";
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
  "20261013090000_budget_actuals_reversal_month.sql",
  "20261014090000_split_expense_to_new_tracker.sql",
];

let db: PGlite;
let operatingId: string;
let categoryId: string;

async function asUser<T>(userId: string, action: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  try { return await action(); } finally { await db.exec("reset role"); }
}

const outstanding = async (poolId: string) => Number((await db.query<{ amount: number }>(
  "select coalesce(sum(delta_minor),0)::bigint amount from public.reimbursement_entries where pool_id=$1", [poolId],
)).rows[0]!.amount);

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
    "select public.create_account('Operating Cash','asset','checking','NOK',true,'operating','ledger',null,1000000,now(),'Opening','new-tracker-operating') id",
  ))).rows[0]!.id;
  categoryId = (await asUser(USER, () => db.query<{ id: string }>(
    "insert into public.categories(user_id,name,kind) values($1,'Miscellaneous','expense') returning id", [USER],
  ))).rows[0]!.id;
}, 30_000);

afterAll(async () => db.close());

const paddle = (key: string, name = "Paddle (Tom, Mina, Sam)") => db.query<{ id: string }>(`
  select public.post_split_expense_to_new_pool($1,60000,45000,$2,'2026-10-21',$3,'2026-10-14T12:00:00Z','Paddle court',null,$4) id
`, [operatingId, name, categoryId, key]);

describe.sequential("split expense opening its own tracker", () => {
  it("charges only the personal share to the budget and parks the rest on a new tracker", async () => {
    const transactionId = (await asUser(USER, () => paddle("paddle-court"))).rows[0]!.id;

    const amounts = (await db.query<{ amount: number }>(
      "select amount_minor::bigint amount from public.transaction_entries where transaction_id=$1 order by amount_minor", [transactionId],
    )).rows.map((row) => Number(row.amount));
    expect(amounts).toEqual([-60000, 15000, 45000]);

    const budget = (await db.query<{ month_start: string; actual: number }>(
      "select month_start::text,actual_minor::bigint actual from public.budget_actuals where user_id=$1 and category_id=$2", [USER, categoryId],
    )).rows.map((row) => ({ month: row.month_start, actual: Number(row.actual) }));
    expect(budget).toEqual([{ month: "2026-10-01", actual: 15000 }]);

    const pool = (await db.query<{ id: string; name: string; date: string; hidden: boolean; net_worth: boolean }>(`
      select p.id,p.name,p.expected_date::text date,a.hidden_from_accounts hidden,a.include_in_net_worth net_worth
      from public.reimbursement_pools p join public.accounts a on a.id=p.receivable_account_id where p.user_id=$1
    `, [USER])).rows[0]!;
    expect(pool.name).toBe("Paddle (Tom, Mina, Sam)");
    expect(pool.date).toBe("2026-10-21");
    expect(pool.hidden).toBe(true);
    expect(pool.net_worth).toBe(true);
    expect(await outstanding(pool.id)).toBe(45000);
  });

  it("publishes the expected money back into the forecast as a net-worth-neutral transfer", async () => {
    const item = (await db.query<{ kind: string; amount: number; date: string }>(`
      select f.kind::text kind,f.amount_minor::bigint amount,f.expected_date::text date
      from public.reimbursement_pools p join public.forecast_items f on f.id=p.forecast_item_id where p.user_id=$1
    `, [USER])).rows[0]!;
    // A transfer, not income: the money is already counted as an asset owed, so it moves
    // from the receivable into cash rather than arriving as new money. Forecast still shows
    // it as money coming in.
    expect(item.kind).toBe("transfer");
    expect(Number(item.amount)).toBe(45000);
    expect(item.date).toBe("2026-10-21");
  });

  it("retires the tracker's forecast item once the group has paid in full", async () => {
    const poolId = (await db.query<{ id: string }>("select id from public.reimbursement_pools where user_id=$1", [USER])).rows[0]!.id;
    for (const [index, amount] of [15000, 15000, 15000].entries()) {
      await asUser(USER, () => db.query(
        "select public.record_reimbursement($1,$2,$3,'2026-10-20T12:00:00Z',null,$4)",
        [poolId, operatingId, amount, `paddle-repay-${index}`],
      ));
    }
    expect(await outstanding(poolId)).toBe(0);
    const forecast = (await db.query<{ n: number }>(
      "select count(*)::int n from public.reimbursement_pools where user_id=$1 and forecast_item_id is not null", [USER],
    )).rows[0]!;
    expect(forecast.n).toBe(0);
    // Settled, so it drops out of the picker while its history stays queryable.
    const entries = (await db.query<{ n: number }>("select count(*)::int n from public.reimbursement_entries where pool_id=$1", [poolId])).rows[0]!;
    expect(entries.n).toBe(4);
  });

  it("opens a separate tracker for the next outing instead of reusing the last one", async () => {
    await asUser(USER, () => paddle("tennis-court", "Tennis (Ravi, Lea)"));
    const names = (await db.query<{ name: string }>("select name from public.reimbursement_pools where user_id=$1 order by created_at", [USER])).rows.map((row) => row.name);
    expect(names).toEqual(["Paddle (Tom, Mina, Sam)", "Tennis (Ravi, Lea)"]);
  });

  it("returns the original transaction on retry rather than opening a duplicate tracker", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int n from public.reimbursement_pools where user_id=$1", [USER])).rows[0]!.n;
    const first = (await db.query<{ id: string }>("select id from public.transactions where idempotency_key='paddle-court'")).rows[0]!.id;
    const retried = (await asUser(USER, () => paddle("paddle-court"))).rows[0]!.id;
    expect(retried).toBe(first);
    const after = (await db.query<{ n: number }>("select count(*)::int n from public.reimbursement_pools where user_id=$1", [USER])).rows[0]!.n;
    expect(after).toBe(before);
  });

  it("rejects an unusable name and leaves no tracker behind", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int n from public.reimbursement_pools where user_id=$1", [USER])).rows[0]!.n;
    await expect(asUser(USER, () => db.query(`
      select public.post_split_expense_to_new_pool($1,60000,45000,'   ','2026-10-21',$2,'2026-10-14T12:00:00Z','Blank',null,'blank-name') id
    `, [operatingId, categoryId]))).rejects.toThrow();
    const after = (await db.query<{ n: number }>("select count(*)::int n from public.reimbursement_pools where user_id=$1", [USER])).rows[0]!.n;
    expect(after).toBe(before);
  });

  it("refuses to spend another owner's account", async () => {
    await expect(asUser(OTHER, () => db.query(`
      select public.post_split_expense_to_new_pool($1,60000,45000,'Theft','2026-10-21',$2,'2026-10-14T12:00:00Z','Nope',null,'cross-owner') id
    `, [operatingId, categoryId]))).rejects.toThrow();
  });
});
