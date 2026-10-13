import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BACKUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHECKSUM = "a".repeat(64);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users (id) values ('${USER_ID}');
  `);
  const sql = await readFile(resolve(process.cwd(), "../supabase/migrations/20260819063329_phase_3_migration_staging.sql"), "utf8");
  await db.exec(sql);
  await db.exec(await readFile(resolve(process.cwd(), "../supabase/migrations/20260819063626_phase_3_staging_fk_indexes.sql"), "utf8"));
});

afterAll(async () => db.close());

describe.sequential("Phase 3 private staging schema", () => {
  it("enables RLS and removes ordinary browser privileges", async () => {
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity from pg_class
      where relnamespace = 'runway_migration'::regnamespace and relkind = 'r' order by relname
    `);
    expect(rls.rows).toHaveLength(3);
    expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);
    const privileges = await db.query<{ anon_access: boolean; authenticated_access: boolean }>(`
      select
        has_schema_privilege('anon', 'runway_migration', 'usage') or has_table_privilege('anon', 'runway_migration.legacy_state_backups', 'select') as anon_access,
        has_schema_privilege('authenticated', 'runway_migration', 'usage') or has_table_privilege('authenticated', 'runway_migration.legacy_state_backups', 'select') as authenticated_access
    `);
    expect(privileges.rows[0]).toEqual({ anon_access: false, authenticated_access: false });
  });

  it("keeps raw backups immutable", async () => {
    await db.query(`insert into runway_migration.legacy_state_backups
      (id, user_id, source_updated_at, source_checksum, state_json)
      values ($1, $2, now(), $3, '{}'::jsonb)`, [BACKUP_ID, USER_ID, CHECKSUM]);
    await expect(db.query("update runway_migration.legacy_state_backups set state_json = '{\"changed\":true}' where id = $1", [BACKUP_ID])).rejects.toThrow(/immutable/i);
    await expect(db.query("delete from runway_migration.legacy_state_backups where id = $1", [BACKUP_ID])).rejects.toThrow(/immutable/i);
  });

  it("enforces one deterministic run per owner, checksum, importer, and target", async () => {
    await db.query(`insert into runway_migration.migration_runs
      (id, user_id, backup_id, source_checksum, source_updated_at, target_schema_version, status, started_at, importer_version)
      values ($1, $2, $3, $4, now(), 'normalized-v1', 'dry_run', now(), 'importer-v1')`, [RUN_ID, USER_ID, BACKUP_ID, CHECKSUM]);
    await expect(db.query(`insert into runway_migration.migration_runs
      (id, user_id, backup_id, source_checksum, source_updated_at, target_schema_version, status, started_at, importer_version)
      values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', $1, $2, $3, now(), 'normalized-v1', 'dry_run', now(), 'importer-v1')`, [USER_ID, BACKUP_ID, CHECKSUM])).rejects.toThrow(/unique|duplicate/i);
  });

  it("allows one classified staging item per source path and no authoritative result", async () => {
    await db.query(`insert into runway_migration.legacy_import_items
      (id, migration_run_id, user_id, source_type, source_path, proposed_target_type, classification, data_quality, resolution_status)
      values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', $1, $2, 'event', 'events[0]', 'forecast_item', 'candidate_forecast_expense', 'exact', 'not_required')`, [RUN_ID, USER_ID]);
    const result = await db.query<{ resulting_entity_id: string | null }>("select resulting_entity_id from runway_migration.legacy_import_items");
    expect(result.rows).toEqual([{ resulting_entity_id: null }]);
    await expect(db.query(`insert into runway_migration.legacy_import_items
      (id, migration_run_id, user_id, source_type, source_path, proposed_target_type, classification, data_quality, resolution_status)
      values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', $1, $2, 'event', 'events[0]', 'forecast_item', 'candidate_forecast_expense', 'exact', 'not_required')`, [RUN_ID, USER_ID])).rejects.toThrow(/unique|duplicate/i);
  });
});
