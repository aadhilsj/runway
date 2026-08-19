import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const A = "91919191-9191-4919-8919-919191919191",
  B = "92929292-9292-4929-8929-929292929292";
const files = [
  "20260819060132_phase_2_ledger_core.sql",
  "20260819060415_phase_2_view_privileges.sql",
  "20260819060530_phase_2_fk_indexes.sql",
  "20260819220000_phase_9_investment_valuations.sql",
];
let db: PGlite, investment: string, cash: string;
async function asUser<T>(user: string, fn: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema extensions;`,
  );
  for (const file of files) {
    let sql = await readFile(
      resolve(process.cwd(), `../supabase/migrations/${file}`),
      "utf8",
    );
    sql = sql.replace(
      "create extension if not exists pgcrypto with schema extensions;",
      "-- pre-provisioned",
    );
    await db.exec(sql);
  }
  await db.query("insert into auth.users(id)values($1),($2)", [A, B]);
  await db.query(
    "insert into public.profiles(user_id,base_currency)values($1,'NOK'),($2,'NOK')",
    [A, B],
  );
  investment = (
    await asUser(A, () =>
      db.query<{ id: string }>(
        "select public.create_account('Investments','asset','investment','NOK',true,'invested','manual_market_value',null,10000,now(),'Opening','p9-i') id",
      ),
    )
  ).rows[0]!.id;
  cash = (
    await asUser(A, () =>
      db.query<{ id: string }>(
        "select public.create_account('Cash','asset','checking','NOK',true,'operating','ledger',null,50000,now(),'Opening','p9-c') id",
      ),
    )
  ).rows[0]!.id;
});
afterAll(() => db.close());
describe.sequential("Phase 9 investment database", () => {
  it("allows an owner to record a non-ledger manual valuation", async () => {
    const before = (
      await db.query<{ count: number }>(
        "select count(*)::int count from public.transactions where user_id=$1",
        [A],
      )
    ).rows[0]!.count;
    await asUser(A, () =>
      db.query(
        "insert into public.portfolio_value_snapshots(user_id,account_id,value_minor,valued_at)values($1,$2,15000,now())",
        [A, investment],
      ),
    );
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from public.transactions where user_id=$1",
          [A],
        )
      ).rows[0]!.count,
    ).toBe(before);
  });
  it("uses latest valuation once in current net worth", async () => {
    const value = await asUser(A, () =>
      db.query<{ net_worth_minor: number }>(
        "select net_worth_minor from public.current_net_worth where user_id=$1",
        [A],
      ),
    );
    expect(Number(value.rows[0]!.net_worth_minor)).toBe(65000);
  });
  it("rejects snapshots for non-investment accounts", async () => {
    await expect(
      asUser(A, () =>
        db.query(
          "insert into public.portfolio_value_snapshots(user_id,account_id,value_minor,valued_at)values($1,$2,50000,now())",
          [A, cash],
        ),
      ),
    ).rejects.toThrow(/investment/i);
  });
  it("isolates snapshots by owner through RLS", async () =>
    expect(
      (
        await asUser(B, () =>
          db.query("select * from public.portfolio_value_snapshots"),
        )
      ).rows,
    ).toHaveLength(0));
  it("rejects cross-owner writes", async () => {
    await expect(
      asUser(B, () =>
        db.query(
          "insert into public.portfolio_value_snapshots(user_id,account_id,value_minor,valued_at)values($1,$2,1,now())",
          [B, investment],
        ),
      ),
    ).rejects.toThrow();
  });
});
