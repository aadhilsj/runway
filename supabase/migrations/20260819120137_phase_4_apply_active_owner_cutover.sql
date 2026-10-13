-- One-time, checksum-gated Phase 4 application for the directly verified Auth owner.
-- The function revalidates identity, source timestamp/checksum, opening balance,
-- warning floor, and prior application state inside a single transaction.
select runway_migration.apply_phase4_cutover(
  'a98dfbfd-1d8a-41fc-82c8-530ef1bc33da'::uuid,
  'aadhil101@gmail.com',
  '5026fad05a2c1ec8d0de9c4477b3dcf621b0c676941a6911b0c489f310370371',
  '979c9c3ca4941e2078328a98ea7c663e8bf97ce545b44cc6d64536abe34044bf',
  '2026-08-19 03:36:02.892+00'::timestamptz,
  '771e5470-36e2-5c1e-9257-65cf6c1287cb'::uuid,
  '2026-08-19'::date
);
