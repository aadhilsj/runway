import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";
const files = [
  "20260819060132_phase_2_ledger_core.sql",
  "20260819060415_phase_2_view_privileges.sql",
  "20260819060530_phase_2_fk_indexes.sql",
  "20260819063329_phase_3_migration_staging.sql",
  "20260819063626_phase_3_staging_fk_indexes.sql",
  "20260819114938_phase_4_actual_money_workflows.sql",
  "20260819115028_phase_4_fk_indexes.sql",
  "20260819160000_phase_5_forecast_recurrence.sql",
  "20260824185324_forecast_grouping_preferences.sql",
];
let db: PGlite;

async function asUser<T>(userId: string, action: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  try { return await action(); } finally { await db.exec("reset role"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create schema extensions;");
  for (const file of files) {
    const raw = await readFile(resolve(process.cwd(), `../supabase/migrations/${file}`), "utf8");
    await db.exec(raw.replace("create extension if not exists pgcrypto with schema extensions;", "-- pre-provisioned"));
  }
  await db.query("insert into auth.users(id) values($1),($2)", [USER_A, USER_B]);
});

afterAll(async () => db.close());

describe.sequential("forecast grouping preferences", () => {
  it("enables RLS and grants no anonymous access", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('forecast_group_aliases','forecast_group_names') order by relname");
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((row) => row.relrowsecurity)).toBe(true);
    const privilege = await db.query<{ alias_select: boolean; name_select: boolean }>("select has_table_privilege('anon','public.forecast_group_aliases','select') alias_select,has_table_privilege('anon','public.forecast_group_names','select') name_select");
    expect(privilege.rows[0]).toEqual({ alias_select: false, name_select: false });
  });

  it("persists an owner's merge and rename while hiding it from another user", async () => {
    await asUser(USER_A, () => db.query("insert into public.forecast_group_aliases(user_id,kind,label_key,group_key) values($1,'expense','phone-bill','utilities')", [USER_A]));
    await asUser(USER_A, () => db.query("insert into public.forecast_group_names(user_id,kind,group_key,display_name) values($1,'expense','utilities','Connectivity')", [USER_A]));
    const own = await asUser(USER_A, () => db.query<{ display_name: string }>("select display_name from public.forecast_group_names"));
    const other = await asUser(USER_B, () => db.query("select * from public.forecast_group_names"));
    expect(own.rows[0]!.display_name).toBe("Connectivity");
    expect(other.rows).toHaveLength(0);
  });

  it("rejects transfer preferences and cross-owner writes", async () => {
    await expect(asUser(USER_A, () => db.query("insert into public.forecast_group_aliases(user_id,kind,label_key,group_key) values($1,'transfer','move','moves')", [USER_A]))).rejects.toThrow();
    await expect(asUser(USER_B, () => db.query("insert into public.forecast_group_names(user_id,kind,group_key,display_name) values($1,'expense','private','Private')", [USER_A]))).rejects.toThrow();
  });
});
