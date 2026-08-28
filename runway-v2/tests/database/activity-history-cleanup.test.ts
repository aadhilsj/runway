import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("only hides owned reversal pairs without altering financial records", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select current_setting('test.uid')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.transactions(id uuid primary key, user_id uuid, reverses_transaction_id uuid, status text, amount integer);
      grant select on public.transactions to authenticated;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
      insert into public.transactions values
      ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',null,'posted',-100),
      ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','posted',100),
      ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',null,'posted',-50);
    `);
    await db.exec(await readFile(resolve(process.cwd(), "../supabase/migrations/20260828231317_activity_history_cleanup.sql"), "utf8"));
    await db.exec("set role authenticated; set test.uid='00000000-0000-0000-0000-000000000001'");
    const insert = (original: number, reversal: number) => db.exec(`insert into public.activity_history_cleanup(user_id,original_id,reversal_id) values (auth.uid(),'10000000-0000-0000-0000-00000000000${original}','10000000-0000-0000-0000-00000000000${reversal}')`);
    await expect(insert(3, 2)).rejects.toThrow();
    await insert(1, 2);
    expect((await db.query("select * from public.activity_history_cleanup")).rows).toHaveLength(1);
    expect((await db.query("select sum(amount)::int as total, count(*)::int as count from public.transactions")).rows[0]).toEqual({ total: -50, count: 3 });
    await db.exec("set test.uid='00000000-0000-0000-0000-000000000002'");
    expect((await db.query("select * from public.activity_history_cleanup")).rows).toHaveLength(0);
    await expect(insert(1, 2)).rejects.toThrow();
    await db.exec("set role anon");
    await expect(db.query("select * from public.activity_history_cleanup")).rejects.toThrow();
  } finally { await db.close(); }
});
