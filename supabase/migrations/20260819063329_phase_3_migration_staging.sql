create schema if not exists runway_migration;

revoke all on schema runway_migration from public, anon, authenticated;
grant usage on schema runway_migration to service_role;

create table runway_migration.legacy_state_backups (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  source_updated_at timestamptz not null,
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  state_json jsonb not null,
  captured_at timestamptz not null default timezone('utc', now()),
  constraint legacy_state_backups_source_unique unique (user_id, source_checksum)
);

comment on table runway_migration.legacy_state_backups is
  'Immutable, private copies of legacy aggregate state used as migration sources.';

create table runway_migration.migration_runs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  backup_id uuid not null references runway_migration.legacy_state_backups (id) on delete restrict,
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  source_updated_at timestamptz not null,
  target_schema_version text not null,
  status text not null check (
    status in ('prepared', 'dry_run', 'needs_review', 'verified', 'failed', 'applied', 'rolled_back')
  ),
  started_at timestamptz not null,
  completed_at timestamptz,
  importer_version text not null,
  summary jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending' check (
    verification_status in ('pending', 'passed', 'failed', 'needs_review')
  ),
  notes text,
  constraint migration_runs_id_user_unique unique (id, user_id),
  constraint migration_runs_source_unique unique (
    user_id,
    source_checksum,
    importer_version,
    target_schema_version
  ),
  constraint migration_runs_completion_check check (
    completed_at is null or completed_at >= started_at
  )
);

comment on table runway_migration.migration_runs is
  'Deterministic migration attempts and their non-authoritative verification reports.';

create table runway_migration.legacy_import_items (
  id uuid primary key,
  migration_run_id uuid not null,
  user_id uuid not null,
  source_type text not null check (btrim(source_type) <> ''),
  source_id text,
  source_path text not null check (btrim(source_path) <> ''),
  source_json jsonb,
  proposed_target_type text not null check (btrim(proposed_target_type) <> ''),
  proposed_target_id uuid,
  classification text not null check (btrim(classification) <> ''),
  data_quality text not null check (
    data_quality in ('exact', 'inferred', 'ambiguous', 'invalid', 'not_applicable')
  ),
  ambiguity_code text,
  ambiguity_notes text,
  resolution_status text not null check (
    resolution_status in ('not_required', 'unresolved', 'resolved', 'intentionally_ignored')
  ),
  proposed_mapping_json jsonb not null default '{}'::jsonb,
  resulting_entity_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint legacy_import_items_run_user_fk
    foreign key (migration_run_id, user_id)
    references runway_migration.migration_runs (id, user_id)
    on delete cascade,
  constraint legacy_import_items_source_unique unique (migration_run_id, source_path),
  constraint legacy_import_items_ambiguity_check check (
    (resolution_status <> 'unresolved') or ambiguity_code is not null
  )
);

comment on table runway_migration.legacy_import_items is
  'One explicit classification per significant legacy source object. source_json may be omitted when source_path addresses the immutable backup.';

create index migration_runs_user_started_idx
  on runway_migration.migration_runs (user_id, started_at desc);

create index legacy_import_items_run_classification_idx
  on runway_migration.legacy_import_items (migration_run_id, classification);

create index legacy_import_items_user_resolution_idx
  on runway_migration.legacy_import_items (user_id, resolution_status)
  where resolution_status = 'unresolved';

create or replace function runway_migration.reject_legacy_backup_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'legacy_state_backups are immutable';
end;
$$;

create trigger legacy_state_backups_immutable
before update or delete on runway_migration.legacy_state_backups
for each row execute function runway_migration.reject_legacy_backup_mutation();

alter table runway_migration.legacy_state_backups enable row level security;
alter table runway_migration.migration_runs enable row level security;
alter table runway_migration.legacy_import_items enable row level security;

revoke all on all tables in schema runway_migration from public, anon, authenticated;
revoke all on all functions in schema runway_migration from public, anon, authenticated;

grant select, insert on runway_migration.legacy_state_backups to service_role;
grant select, insert, update, delete on runway_migration.migration_runs to service_role;
grant select, insert, update, delete on runway_migration.legacy_import_items to service_role;

alter default privileges in schema runway_migration
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema runway_migration
  revoke all on functions from public, anon, authenticated;
