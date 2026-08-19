create index checksum_reconciliations_run_owner_idx
  on runway_migration.checksum_reconciliations (migration_run_id, user_id);
create index checksum_reconciliations_user_idx
  on runway_migration.checksum_reconciliations (user_id);
