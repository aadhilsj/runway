# Migration safety

## Production state captured

On 2026-08-19, `public.runway_state` in Supabase project `kmbepvzsbmucrvhbjgbj` contained two rows. RLS was enabled with owner-scoped select, insert, and update policies. The backup operation used read-only SQL; production rows, policies, schema, Auth, and deployment were not changed.

The active owner could not be identified from safe evidence. Both rows are therefore labeled only by deterministic export order, and both remain untouched.

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

Phase 0/1 rollback is simply continuing to serve the unchanged legacy app and aggregate table. A future normalized rollout must keep reads behind an explicit cutover control, permit an immediate return to the aggregate read path, and never depend on destructive reverse migration.
