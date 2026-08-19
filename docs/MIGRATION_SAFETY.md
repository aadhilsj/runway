# Migration safety

## Production state captured

On 2026-08-19, `public.runway_state` in Supabase project `kmbepvzsbmucrvhbjgbj` contained two rows. RLS was enabled with owner-scoped select, insert, and update policies. The backup operation used read-only SQL; production rows, policies, schema, Auth, and deployment were not changed.

On 2026-08-19, direct Supabase Auth evidence established that the known product-owner email maps to exactly one of the two `runway_state` user IDs. Phase 3 uses only that Auth-verified row. The second authenticated user's row remains preserved, backed up, excluded, and untouched. Ownership was not inferred from financial contents.

## Phase 2 schema status

On 2026-08-19, three migration-history-backed changes created the empty normalized ledger schema, narrowed aggregate-view privileges, and added ownership-composite foreign-key indexes. All normalized tables contained zero rows after application. Both legacy row checksums still matched the Phase 0 backup. No legacy data was read into, copied to, or classified for the normalized schema, and the legacy deployment was not changed.

## Phase 3 dry-run status

The `runway_migration` private schema contains `legacy_state_backups`, `migration_runs`, and `legacy_import_items`. It is outside the Data API, browser-role privileges are revoked, RLS is enabled without browser policies, and raw backups reject updates and deletes.

The owner-only importer reads the immutable ignored backup, validates and classifies every significant source object, and writes private machine-readable, human, and product-owner reports under ignored `migration/output/`. Raw source JSON is not copied into each item; source paths address the immutable backup. The live connector permits DDL but runs ordinary SQL as read-only, so live staging rows were intentionally left empty instead of embedding private product-owner data in a schema migration.

The dry run treats current balance as the sole proposed opening ledger value. Settled events and bucket spend remain non-authoritative references, future forecasts have zero actual-ledger effect, UI activity is intentionally ignored after backup preservation, and no planned new Funds are created.

## Backups and verification

The ignored `migration/fixtures/legacy/raw/` directory contains:

- an encrypted full export containing `user_id`, `updated_at`, full `state`, and checksums;
- a local plaintext recovery copy;
- a checksum manifest.

The ignored `.runway-private-backups/` directory contains the private PGP key and passphrase. The plaintext copy and key material must never be committed or shared. SHA-256 checksums cover the UTF-8 bytes of each exported canonical state string and were recomputed after writing the local export.

The committed `migration/fixtures/legacy/sanitized-structure.json` is invented structural data. It is not a backup and cannot be used to restore an account.

## Never-delete rule

Future migration code must copy and verify. It must not delete, truncate, overwrite, or repurpose `public.runway_state`. Any cleanup requires a later, separately approved retention decision after an observation period.

## Rollback

The application still serves the unchanged legacy app and aggregate table; Runway 2 does not read the normalized tables in production yet. A future normalized rollout must keep reads behind an explicit cutover control, permit an immediate return to the aggregate read path, and never depend on destructive reverse migration.
