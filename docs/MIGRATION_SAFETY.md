# Migration safety

## Production state captured

On 2026-08-19, `public.runway_state` in Supabase project `kmbepvzsbmucrvhbjgbj` contained two rows. RLS was enabled with owner-scoped select, insert, and update policies. The backup operation used read-only SQL; production rows, policies, schema, Auth, and deployment were not changed.

The active owner could not be identified from safe evidence. Both rows are therefore labeled only by deterministic export order, and both remain untouched.

## Phase 2 schema status

On 2026-08-19, three migration-history-backed changes created the empty normalized ledger schema, narrowed aggregate-view privileges, and added ownership-composite foreign-key indexes. All normalized tables contained zero rows after application. Both legacy row checksums still matched the Phase 0 backup. No legacy data was read into, copied to, or classified for the normalized schema, and the legacy deployment was not changed.

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
