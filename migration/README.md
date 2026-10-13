# Migration framework

Phase 3 implements deterministic legacy classification and dry-run reconciliation. It does not mutate `public.runway_state` or create authoritative ledger records.

## Versioning

- `legacy-aggregate-v1`: the current JSON aggregate in `public.runway_state`.
- `normalized-v1`: the ledger schema. Phase 4 applied the verified opening state and eligible planning/reference records for the active owner only.
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

Checksum scope must always be named. `export_state_sha256` covers the exact UTF-8 bytes of `state_canonical_text`; the live-state checksum covers PostgreSQL `jsonb::text` bytes. These representations can have different hashes while parsing to the same JSON value. Cutover verification therefore requires both exact representation checks and a semantic state comparison; a checksum from one scope must never be labeled as the checksum of another.

## Private database staging

`runway_migration` is an unexposed schema. Browser roles have no schema, table, or function privileges, and its tables also have RLS enabled without browser policies. `legacy_state_backups` is immutable. Import items normally refer to the backup by source path, leaving `source_json` null to avoid duplicating raw financial JSON.

The completed dry run remains stored in the ignored local output described above. Phase 4 copied its checksum-verified immutable source into private staging as part of the transactional application and recorded the applied, verified migration run. Browser roles still have no access to raw migration data.

## Required behavior

1. Read and checksum the source before transforming it.
2. Refuse to continue when the checksum differs from the approved source manifest.
3. Use deterministic natural/source IDs so rerunning cannot duplicate records.
4. Replace an unapproved same-version staging run inside a transaction and make verification a prerequisite for any later apply.
5. Never delete or overwrite the legacy aggregate during migration.
6. Make a completed run with the same source checksum a no-op.
7. Keep cutover and rollback separate from data copying.

Phase 2 established posting invariants and Phase 3 did not call posting RPCs. The approved Phase 4 apply followed the checksum, identity, idempotency, never-delete, and verification rules above. Any later re-application must remain a no-op for the same owner/source/importer combination.
