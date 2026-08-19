# Supabase production setup

Runway 2 uses the live normalized schema under `supabase/migrations`. Do not rerun the legacy `schema.sql` or the Phase 4 cutover against an initialized project.

## Frontend environment

Configure Vercel production and preview with only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

These values are client-safe. Never expose the service-role key, database password, management access token, migration credentials, backup keys, or raw private migration data to Vite or browser code.

## Authentication

- Site URL: `https://runway-xi.vercel.app`
- Redirect allow-list: the primary URL plus the current verified preview URL recorded in `docs/PRODUCTION_CUTOVER.md`
- Sign-in method: passwordless email link or one-time code
- `signInWithOtp` must keep `shouldCreateUser: false` for the single-owner product

Local development uses the same two variable names from `runway-v2/.env.example`. The root legacy frontend and `public.runway_state` remain preserved reference material; all new authoritative activity belongs in the Runway 2 normalized ledger.
