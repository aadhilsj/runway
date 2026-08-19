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

## Phase 4 authoritative state

On 2026-08-19, the checksum-gated Phase 4 application established Runway 2 accounting truth for only the Auth-verified product owner. It created one editable `Operating Cash` asset account and one posted opening-balance transaction for 1,195,600 minor NOK. The derived account balance and net worth both reconcile exactly to the legacy `currentBalance` of NOK 11,956.00. The legacy warning threshold became the editable 900,000-minor-NOK operating floor.

The cutover also created 48 expected forecast items and three scenarios. These are planning inputs and cannot change ledger balances. Fifty settled events, three product-owner-resolved overdue events, two template references, 56 possible recurring-lineage hints, and ten legacy budget-history rows are preserved outside the authoritative ledger. No historical legacy event or bucket entry was posted as an actual transaction.

The application is recorded as migration run `771e5470-36e2-5c1e-9257-65cf6c1287cb`, with verification status `passed`. The second legacy user has no profile, account, transaction, forecast, scenario, history, or application record. Both `runway_state` timestamps and checksums remained unchanged after application.

## Phase 4.1 checksum reconciliation

The Phase 4 report incorrectly presented `979c9c3ca494…` as the approved Phase 3 checksum. That value is not produced by the committed importer or any preserved checksum artifact; it first appeared in the Phase 4 application migration. The actual Phase 3 artifact checksum is `979c9c3c5b36…`, calculated over the preserved `state_canonical_text` bytes. The live/cutover value `5026fad05a2c…` is a different checksum scope: PostgreSQL `jsonb::text` bytes.

The Phase 3 parsed state, immutable cutover backup, and live legacy JSON are semantically identical. Their source timestamp is also identical. Field-level reconciliation found zero forecast, scenario, template, opening-balance, floor, bucket, UI, history, or metadata changes. A private `checksum_reconciliations` audit record preserves the originally reported value, both verified representation-specific hashes, the semantic-equality result, and the no-remediation decision. It did not rewrite the immutable backup or any financial/planning record.

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

The legacy app and aggregate table remain deployed and unchanged. Runway 2 reads only normalized data, but it has not replaced or disabled the legacy deployment. A return to the legacy application therefore requires no reverse migration. The verified Runway 2 opening transaction must not be deleted or rewritten; any later accounting correction must use an explicit reconciliation adjustment or reversal.
