create index migration_runs_backup_idx
  on runway_migration.migration_runs (backup_id);

create index legacy_import_items_run_user_idx
  on runway_migration.legacy_import_items (migration_run_id, user_id);
