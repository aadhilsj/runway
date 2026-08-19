# Migration framework

Phase 3 implements deterministic legacy classification and dry-run reconciliation. It does not mutate `public.runway_state` or create authoritative ledger records.

## Versioning

- `legacy-aggregate-v1`: the current JSON aggregate in `public.runway_state`.
- `normalized-v1`: the Phase 2 ledger schema; it remains empty until an approved Phase 3 import.
- Every migration run receives a deterministic UUID derived from the owner, source checksum, importer version, and target schema version.
- A run records source row identity, source checksum, target schema version, code version, start/end timestamps, outcome, and verification result.

## Phase 3 implementation

The TypeScript importer lives in `migration/src/`. It validates the aggregate sections, normalizes exact minor-unit amounts, classifies events/scenarios/templates/buckets, detects ambiguity, reconciles the opening balance, and renders both machine-readable and product-owner reports.

Run it only with an Auth-verified owner ID and an immutable private source export:

```sh
node migration/src/cli.ts \
  --source migration/fixtures/legacy/raw/runway-state-full-backup.json \
  --user-id <auth-verified-owner-uuid> \
  --exclude-user-id <preserved-row-uuid> \
  --migration-date YYYY-MM-DD \
  --output-dir migration/output/active-owner
```

Node 22.18 or newer is required for native TypeScript execution. `migration/output/` is ignored because reports contain private financial descriptions. Files are written with owner-only permissions.

The same owner/checksum/importer/target combination produces the same run and item IDs. A rerun replaces that run's unapproved staging items instead of appending duplicates. Changing the importer version creates a new versioned run.

## Private database staging

`runway_migration` is an unexposed schema. Browser roles have no schema, table, or function privileges, and its tables also have RLS enabled without browser policies. `legacy_state_backups` is immutable. Import items normally refer to the backup by source path, leaving `source_json` null to avoid duplicating raw financial JSON.

The live Phase 3 schema is present, but its staging tables remain empty. The connected SQL channel is read-only for DML, and private user data was deliberately not embedded in a schema migration as a workaround. The completed dry run is stored in the ignored local output described above.

## Required behavior

1. Read and checksum the source before transforming it.
2. Refuse to continue when the checksum differs from the approved source manifest.
3. Use deterministic natural/source IDs so rerunning cannot duplicate records.
4. Replace an unapproved same-version staging run inside a transaction and make verification a prerequisite for any later apply.
5. Never delete or overwrite the legacy aggregate during migration.
6. Make a completed run with the same source checksum a no-op.
7. Keep cutover and rollback separate from data copying.

Phase 2 established empty normalized tables and posting invariants. Phase 3 does not call those posting RPCs. A future approved apply must still follow the checksum, idempotency, never-delete, verification, and separate-cutover rules above.
