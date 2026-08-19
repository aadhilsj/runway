import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

let db: PGlite;
let currentA: string;
let savingsA: string;
let currentB: string;

async function asUser<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await operation();
  } finally {
    await db.exec("reset role");
  }
}

async function createAccount(userId: string, name: string, subtype: "checking" | "savings", key: string): Promise<string> {
  return asUser(userId, async () => {
    const result = await db.query<{ id: string }>(`
      select public.create_account(
        $1, 'asset', $2::public.runway_account_subtype, 'NOK', true,
        $3::public.runway_liquidity_class, 'ledger', null, null, null, null, $4
      ) as id
    `, [name, subtype, subtype === "checking" ? "operating" : "liquid", key]);
    return result.rows[0]!.id;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema extensions;
  `);
  const migrationPath = resolve(process.cwd(), "../supabase/migrations/20260819060132_phase_2_ledger_core.sql");
  const migration = (await readFile(migrationPath, "utf8"))
    .replace("create extension if not exists pgcrypto with schema extensions;", "-- Extension is pre-provisioned by the PGlite harness.");
  await db.exec(migration);
  await db.exec(await readFile(resolve(process.cwd(), "../supabase/migrations/20260819060415_phase_2_view_privileges.sql"), "utf8"));
  await db.exec(await readFile(resolve(process.cwd(), "../supabase/migrations/20260819060530_phase_2_fk_indexes.sql"), "utf8"));
  await db.query("insert into auth.users (id) values ($1), ($2)", [USER_A, USER_B]);
  currentA = await createAccount(USER_A, "User A current", "checking", "user-a-current");
  savingsA = await createAccount(USER_A, "User A savings", "savings", "user-a-savings");
  currentB = await createAccount(USER_B, "User B current", "checking", "user-b-current");
});

afterAll(async () => {
  await db.close();
});

describe.sequential("Phase 2 database invariants", () => {
  it("enables RLS on every exposed Runway 2 table", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in ('profiles','accounts','categories','transactions','transaction_entries','account_balance_snapshots')
      order by relname
    `);
    expect(result.rows).toHaveLength(6);
    expect(result.rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it("keeps aggregate views authenticated and read-only", async () => {
    const result = await db.query<{
      anon_select: boolean;
      authenticated_select: boolean;
      authenticated_insert: boolean;
      authenticated_update: boolean;
    }>(`
      select
        has_table_privilege('anon', 'public.account_balances', 'select') as anon_select,
        has_table_privilege('authenticated', 'public.account_balances', 'select') as authenticated_select,
        has_table_privilege('authenticated', 'public.account_balances', 'insert') as authenticated_insert,
        has_table_privilege('authenticated', 'public.account_balances', 'update') as authenticated_update
    `);
    expect(result.rows[0]).toEqual({
      anon_select: false,
      authenticated_select: true,
      authenticated_insert: false,
      authenticated_update: false,
    });
  });

  it("removes direct browser mutation privileges from ledger tables", async () => {
    const result = await db.query<{
      transaction_insert: boolean;
      transaction_update: boolean;
      entry_insert: boolean;
      entry_update: boolean;
      entry_delete: boolean;
    }>(`
      select
        has_table_privilege('authenticated', 'public.transactions', 'insert') as transaction_insert,
        has_table_privilege('authenticated', 'public.transactions', 'update') as transaction_update,
        has_table_privilege('authenticated', 'public.transaction_entries', 'insert') as entry_insert,
        has_table_privilege('authenticated', 'public.transaction_entries', 'update') as entry_update,
        has_table_privilege('authenticated', 'public.transaction_entries', 'delete') as entry_delete
    `);
    expect(result.rows[0]).toEqual({
      transaction_insert: false,
      transaction_update: false,
      entry_insert: false,
      entry_update: false,
      entry_delete: false,
    });
  });

  it("prevents user A from reading or updating user B accounts", async () => {
    await asUser(USER_A, async () => {
      const read = await db.query<{ id: string }>("select id from public.accounts where id = $1", [currentB]);
      expect(read.rows).toHaveLength(0);
      const update = await db.query<{ id: string }>("update public.accounts set name = 'Not allowed' where id = $1 returning id", [currentB]);
      expect(update.rows).toHaveLength(0);
    });
  });

  it("rejects cross-user account references atomically", async () => {
    const before = await db.query<{ count: number }>("select count(*)::int as count from public.transactions");
    await expect(asUser(USER_A, () => db.query(`
      select public.post_transfer($1, $2, 10000, now(), 'Cross-user attempt', null, 'cross-user-transfer')
    `, [currentA, currentB]))).rejects.toThrow(/another user|unavailable/i);
    const after = await db.query<{ count: number }>("select count(*)::int as count from public.transactions");
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });

  it("posts a transfer atomically with two balanced entries", async () => {
    const transactionId = await asUser(USER_A, async () => {
      const result = await db.query<{ id: string }>(`
        select public.post_transfer($1, $2, 500000, '2030-01-02T00:00:00Z', 'Move to savings', null, 'transfer-atomic') as id
      `, [currentA, savingsA]);
      return result.rows[0]!.id;
    });
    const entries = await db.query<{ amount_minor: number }>(`
      select amount_minor from public.transaction_entries where transaction_id = $1 order by amount_minor
    `, [transactionId]);
    expect(entries.rows.map((row) => Number(row.amount_minor))).toEqual([-500000, 500000]);
  });

  it("returns the existing transaction for an identical idempotent retry", async () => {
    const command = () => asUser(USER_A, async () => {
      const result = await db.query<{ id: string }>(`
        select public.post_transfer($1, $2, 25000, '2030-01-03T00:00:00Z', 'Retry-safe transfer', null, 'retry-transfer') as id
      `, [currentA, savingsA]);
      return result.rows[0]!.id;
    });
    const first = await command();
    const second = await command();
    expect(second).toBe(first);
    const count = await db.query<{ count: number }>("select count(*)::int as count from public.transactions where idempotency_key = 'retry-transfer'");
    expect(count.rows[0]!.count).toBe(1);
  });

  it("rejects a category owned by another user without partial posting", async () => {
    const categoryId = await asUser(USER_B, async () => {
      const result = await db.query<{ id: string }>(`
        insert into public.categories (user_id, name, kind) values ($1, 'Private category', 'income') returning id
      `, [USER_B]);
      return result.rows[0]!.id;
    });
    const before = await db.query<{ count: number }>("select count(*)::int as count from public.transactions");
    await expect(asUser(USER_A, () => db.query(`
      select public.post_income($1, 100000, $2, now(), 'Invalid category', null, null, 'invalid-category')
    `, [currentA, categoryId]))).rejects.toThrow(/category.*another user|category is unavailable/i);
    const after = await db.query<{ count: number }>("select count(*)::int as count from public.transactions");
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });

  it("rejects an unbalanced posted transaction at the database constraint", async () => {
    await db.exec("begin");
    try {
      await db.query(`
        insert into public.transactions (user_id, kind, status, currency, occurred_at, description, posted_at)
        values ($1, 'adjustment', 'posted', 'NOK', now(), 'Unbalanced direct post', now())
      `, [USER_A]);
      await expect(db.exec("commit")).rejects.toThrow(/sum to zero/i);
    } finally {
      await db.exec("rollback").catch(() => undefined);
    }
  });

  it("prevents ordinary clients from modifying posted entries directly", async () => {
    const entry = await db.query<{ id: string }>(`
      select e.id from public.transaction_entries e
      join public.transactions t on t.id = e.transaction_id
      where t.user_id = $1 and t.status = 'posted' limit 1
    `, [USER_A]);
    await expect(asUser(USER_A, () => db.query(
      "update public.transaction_entries set amount_minor = amount_minor + 1 where id = $1",
      [entry.rows[0]!.id],
    ))).rejects.toThrow(/permission denied/i);
  });

  it("posts a reversal, links both records, and restores account balances", async () => {
    const before = await asUser(USER_A, async () => {
      const result = await db.query<{ display_balance_minor: number }>("select display_balance_minor from public.account_balances where account_id = $1", [currentA]);
      return Number(result.rows[0]!.display_balance_minor);
    });
    const expenseId = await asUser(USER_A, async () => {
      const result = await db.query<{ id: string }>(`
        select public.post_expense($1, 910000, null, '2030-01-04T00:00:00Z', 'Rent', null, null, 'rent-to-reverse') as id
      `, [currentA]);
      return result.rows[0]!.id;
    });
    const reversalId = await asUser(USER_A, async () => {
      const result = await db.query<{ id: string }>(`
        select public.reverse_transaction($1, '2030-01-05T00:00:00Z', 'Correction', 'reverse-rent') as id
      `, [expenseId]);
      return result.rows[0]!.id;
    });
    const links = await db.query<{ id: string; reverses_transaction_id: string | null }>(`
      select id, reverses_transaction_id from public.transactions where id in ($1, $2) order by created_at
    `, [expenseId, reversalId]);
    expect(links.rows).toHaveLength(2);
    expect(links.rows.find((row) => row.id === reversalId)?.reverses_transaction_id).toBe(expenseId);
    const after = await asUser(USER_A, async () => {
      const result = await db.query<{ display_balance_minor: number }>("select display_balance_minor from public.account_balances where account_id = $1", [currentA]);
      return Number(result.rows[0]!.display_balance_minor);
    });
    expect(after).toBe(before);
  });
});
