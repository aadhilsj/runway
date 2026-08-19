# Migration framework

Phase 0 defines safety concepts only. It does not create normalized tables or mutate `public.runway_state`.

## Versioning

- `legacy-aggregate-v1`: the current JSON aggregate in `public.runway_state`.
- `normalized-v1`: reserved for a future, explicitly reviewed Phase 2 schema.
- Every future migration run receives an immutable run ID such as `20260819T120000Z_<short-id>`.
- A run records source row identity, source checksum, target schema version, code version, start/end timestamps, outcome, and verification result.

## Required behavior for future migration code

1. Read and checksum the source before transforming it.
2. Refuse to continue when the checksum differs from the approved source manifest.
3. Use deterministic natural/source IDs so rerunning cannot duplicate records.
4. Upsert inside a transaction and make verification a prerequisite for commit.
5. Never delete or overwrite the legacy aggregate during migration.
6. Make a completed run with the same source checksum a no-op.
7. Keep cutover and rollback separate from data copying.

No migration runner is implemented in Phase 1; these are contracts for Phase 2.
