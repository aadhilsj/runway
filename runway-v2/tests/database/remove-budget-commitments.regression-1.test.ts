// Regression coverage added when the unused budget-commitments feature was removed.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prerequisiteMigrations = [
  "20260819060132_phase_2_ledger_core.sql",
  "20260819060415_phase_2_view_privileges.sql",
  "20260819060530_phase_2_fk_indexes.sql",
  "20260819063329_phase_3_migration_staging.sql",
  "20260819063626_phase_3_staging_fk_indexes.sql",
  "20260819114938_phase_4_actual_money_workflows.sql",
  "20260819115028_phase_4_fk_indexes.sql",
  "20260819160000_phase_5_forecast_recurrence.sql",
  "20260819190000_phase_6_funds_payday_budgets.sql",
];

async function migration(name: string) {
  return (await readFile(resolve(process.cwd(), `../supabase/migrations/${name}`), "utf8"))
    .replace("create extension if not exists pgcrypto with schema extensions;", "-- pre-provisioned");
}

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema extensions;`);
  for (const name of prerequisiteMigrations) await db.exec(await migration(name));
});

afterAll(async () => db.close());

describe("budget commitment removal migration", () => {
  it("drops the obsolete public view", async () => {
    expect((await db.query<{ relation: string | null }>("select to_regclass('public.budget_commitments')::text relation")).rows[0]?.relation).toBe("budget_commitments");
    await db.exec(await migration("20260824224407_remove_budget_commitments.sql"));
    expect((await db.query<{ relation: string | null }>("select to_regclass('public.budget_commitments')::text relation")).rows[0]?.relation).toBeNull();
  });
});
