create table runway_migration.checksum_reconciliations (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null unique references runway_migration.migration_runs (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  originally_reported_checksum text not null check (originally_reported_checksum ~ '^[0-9a-f]{64}$'),
  verified_export_text_checksum text not null check (verified_export_text_checksum ~ '^[0-9a-f]{64}$'),
  verified_jsonb_text_checksum text not null check (verified_jsonb_text_checksum ~ '^[0-9a-f]{64}$'),
  semantic_state_equal boolean not null,
  financial_classification text not null check (financial_classification in ('A','B','C','D')),
  reconciliation_outcome text not null,
  evidence jsonb not null,
  verified_at timestamptz not null default clock_timestamp(),
  constraint checksum_reconciliations_run_owner_fkey foreign key (migration_run_id, user_id)
    references runway_migration.migration_runs (id, user_id) on delete restrict
);

alter table runway_migration.checksum_reconciliations enable row level security;
revoke all on runway_migration.checksum_reconciliations from public, anon, authenticated;

do $$
declare
  v_user_id constant uuid := 'a98dfbfd-1d8a-41fc-82c8-530ef1bc33da';
  v_run_id constant uuid := '771e5470-36e2-5c1e-9257-65cf6c1287cb';
  v_reported constant text := '979c9c3ca4941e2078328a98ea7c663e8bf97ce545b44cc6d64536abe34044bf';
  v_export constant text := '979c9c3c5b36d1783ad3497d32813399652599b146902259318d1216391d73d0';
  v_jsonb constant text := '5026fad05a2c1ec8d0de9c4477b3dcf621b0c676941a6911b0c489f310370371';
  v_backup runway_migration.legacy_state_backups%rowtype;
begin
  select b.* into strict v_backup
  from runway_migration.legacy_state_backups b
  join runway_migration.migration_runs mr on mr.backup_id=b.id
  where b.user_id=v_user_id and mr.id=v_run_id;

  if encode(extensions.digest(v_backup.state_json::text,'sha256'),'hex') <> v_jsonb then
    raise exception 'Phase 4.1 stopped: cutover backup JSONB checksum differs';
  end if;
  if not exists (select 1 from public.runway_state rs where rs.user_id=v_user_id and rs.state=v_backup.state_json and rs.updated_at=v_backup.source_updated_at) then
    raise exception 'Phase 4.1 stopped: legacy state no longer equals the immutable cutover backup';
  end if;
  if (select count(*) from public.transactions where user_id=v_user_id and kind='opening_balance') <> 1
    or (select count(*) from public.transactions where user_id=v_user_id and legacy_source_id is not null) <> 0
    or (select count(*) from public.forecast_items where user_id=v_user_id) <> 48
    or (select count(*) from public.scenarios where user_id=v_user_id) <> 3 then
    raise exception 'Phase 4.1 stopped: authoritative or planning invariants differ';
  end if;

  insert into runway_migration.checksum_reconciliations (
    migration_run_id,user_id,originally_reported_checksum,verified_export_text_checksum,
    verified_jsonb_text_checksum,semantic_state_equal,financial_classification,reconciliation_outcome,evidence
  ) values (
    v_run_id,v_user_id,v_reported,v_export,v_jsonb,true,'A','no_financial_or_planning_remediation_required',
    jsonb_build_object(
      'cause','different serialization scopes plus an incorrectly transcribed Phase 4 source checksum',
      'phase3_artifact_checksum',v_export,
      'phase4_live_jsonb_text_checksum',v_jsonb,
      'forecast_missing',0,'forecast_extra',0,'forecast_field_mismatches',0,
      'scenario_mismatches',0,'template_mismatches',0,'legacy_row_mutated',false,'ledger_rows_written',0
    )
  );
end $$;
