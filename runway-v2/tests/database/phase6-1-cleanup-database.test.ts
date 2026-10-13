import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER_A = "61616161-6161-4616-8616-616161616161";
const USER_B = "62626262-6262-4626-8626-626262626262";
const migrationsBeforeCleanup = [
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
];

let db: PGlite;
let accountId: string;

async function migrationSql(file: string): Promise<string> {
  const sql = await readFile(resolve(process.cwd(), `../supabase/migrations/${file}`), "utf8");
  return sql.replace("create extension if not exists pgcrypto with schema extensions;", "-- pre-provisioned");
}

async function asUser<T>(userId: string, action: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  try { return await action(); } finally { await db.exec("reset role"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema extensions;`);
  for (const file of migrationsBeforeCleanup) await db.exec(await migrationSql(file));

  await db.query("insert into auth.users(id) values($1),($2)", [USER_A, USER_B]);
  await db.query("insert into public.profiles(user_id,base_currency,timezone,operating_floor_minor) values($1,'NOK','Europe/Oslo',900000),($2,'NOK','UTC',0)", [USER_A, USER_B]);
  accountId = (await asUser(USER_A, () => db.query<{ id: string }>(
    "select public.create_account('Operating Cash','asset','checking','NOK',true,'operating','ledger',null,1195600,now(),'Opening','phase6-1-opening') id",
  ))).rows[0]!.id;

  const categories = await db.query<{ id: string; name: string }>(
    "insert into public.categories(user_id,name,kind,sort_order) values($1,'Bills','expense',10),($1,'Groceries','expense',20),($1,'Housing','expense',30),($1,'Miscellaneous','expense',40),($1,'Travel','expense',50) returning id,name",
    [USER_A],
  );
  const categoryId = Object.fromEntries(categories.rows.map((row) => [row.name, row.id]));
  const periodId = (await db.query<{ id: string }>(
    "insert into public.budget_periods(user_id,month_start,currency,status) values($1,'2026-10-01','NOK','planned') returning id",
    [USER_A],
  )).rows[0]!.id;
  const groupId = (await db.query<{ id: string }>(
    "insert into public.budget_groups(user_id,name) values($1,'Groceries + Misc') returning id",
    [USER_A],
  )).rows[0]!.id;
  await db.query(
    "insert into public.budget_group_categories(user_id,group_id,category_id) values($1,$2,$3),($1,$2,$4)",
    [USER_A, groupId, categoryId.Groceries, categoryId.Miscellaneous],
  );
  await db.query(
    `insert into public.budget_lines(user_id,budget_period_id,group_id,budgeted_minor,notes)
       values($1,$2,$3,500000,'Combined cap preserved because the legacy plan did not justify an arbitrary split.')`,
    [USER_A, periodId, groupId],
  );
  for (const [name, amount] of [["Bills", 154500], ["Housing", 910000], ["Travel", 39300]] as const) {
    await db.query(
      "insert into public.budget_lines(user_id,budget_period_id,category_id,budgeted_minor) values($1,$2,$3,$4)",
      [USER_A, periodId, categoryId[name], amount],
    );
  }

  await db.exec(await migrationSql("20260819200000_phase_6_1_budget_and_function_cleanup.sql"));
});

afterAll(async () => db.close());

describe("Phase 6.1 cleanup migration", () => {
  it("reconciles October to NOK 16,538 with the extra NOK 500 inside the single group line", async () => {
    const lines = await db.query<{ name: string; amount: number }>(`select coalesce(c.name,g.name) name,l.budgeted_minor::int amount
      from public.budget_lines l join public.budget_periods p on p.id=l.budget_period_id
      left join public.categories c on c.id=l.category_id left join public.budget_groups g on g.id=l.group_id
      where p.user_id=$1 and p.month_start='2026-10-01' order by name`, [USER_A]);
    expect(lines.rows).toEqual([
      { name: "Bills", amount: 154500 },
      { name: "Groceries + Misc", amount: 550000 },
      { name: "Housing", amount: 910000 },
      { name: "Travel", amount: 39300 },
    ]);
    expect(lines.rows.reduce((sum, row) => sum + row.amount, 0)).toBe(1653800);
  });

  it("has no direct line for either category covered by Groceries + Misc", async () => {
    const overlap = await db.query<{ count: number }>(`select count(*)::int count from public.budget_lines l
      join public.budget_periods p on p.id=l.budget_period_id
      join public.budget_group_categories gc on gc.category_id=l.category_id and gc.user_id=l.user_id
      join public.budget_groups g on g.id=gc.group_id and g.user_id=gc.user_id
      where p.user_id=$1 and p.month_start='2026-10-01' and g.name='Groceries + Misc'`, [USER_A]);
    expect(overlap.rows[0]!.count).toBe(0);
  });

  it("retires the one-time Phase 4 cutover function without changing its audit tables", async () => {
    const functionState = await db.query<{ retired: boolean; stale: number }>(`select
      to_regprocedure('runway_migration.apply_phase4_cutover(uuid,text,text,text,timestamptz,uuid,date)') is null retired,
      count(*) filter(where prosrc like '%runway_forecast_kind%')::int stale from pg_proc`);
    expect(functionState.rows[0]).toEqual({ retired: true, stale: 0 });
    expect((await db.query<{ count: number }>("select count(*)::int count from runway_migration.application_records")).rows[0]!.count).toBe(0);
  });

  it("keeps the authoritative opening ledger and second user unchanged", async () => {
    expect((await db.query<{ count: number }>("select count(*)::int count from public.transactions where user_id=$1 and kind='opening_balance'", [USER_A])).rows[0]!.count).toBe(1);
    expect((await db.query<{ count: number }>("select count(*)::int count from public.transaction_entries where user_id=$1", [USER_A])).rows[0]!.count).toBe(2);
    expect((await db.query<{ amount: number }>("select display_balance_minor::int amount from public.account_balances where user_id=$1 and account_id=$2", [USER_A, accountId])).rows[0]!.amount).toBe(1195600);
    expect((await db.query<{ count: number }>("select count(*)::int count from public.budget_periods where user_id=$1", [USER_B])).rows[0]!.count).toBe(0);
  });
});
