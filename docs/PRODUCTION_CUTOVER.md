# Runway 2 production cutover

## Cutover record

- Cutover: `2026-08-19T19:22:02Z` (`2026-08-19 21:22:02 CEST`)
- Provider/project: Vercel / `runway`
- Primary URL: `https://runway-xi.vercel.app`
- Production deployment: `dpl_FoReMnrJ8EZUCRCBfUUP1mde6xvV`
- Immutable production URL: `https://runway-nie936oz3-aadhilshahjahan11-1221s-projects.vercel.app`
- Deployed commit: `236de314aaba5506cf03b1afd6b99626c0347a52`
- Verified preview: `dpl_CEy4qG4ENrCEyPVKe7D1xVpcKqUo`
- Preview URL: `https://runway-dyz03g8le-aadhilshahjahan11-1221s-projects.vercel.app`
- Supabase project: `kmbepvzsbmucrvhbjgbj`, schema version `7`

Vercel installs with `pnpm install --frozen-lockfile`, builds with `pnpm build`, publishes `build/client`, and rewrites application routes to `index.html`. Only the client-safe Supabase URL and publishable key are configured in Vercel. Vercel link state and downloaded environment files remain ignored.

## Preserved legacy frontend

- Deployment: `dpl_CScbZEKKkrs3b1DnjxZ8fZ7sHba5`
- Immutable URL: `https://runway-euqje7by1-aadhilshahjahan11-1221s-projects.vercel.app`
- Legacy source: the root `index.html`, `styles.css`, `app.js`, manifest, and service worker remain in Git.

The legacy URL is an emergency frontend artifact and historical reference, not accounting authority. It has no primary alias or Runway 2 navigation link. Do not enter new activity there: the normalized ledger remains authoritative even during a frontend rollback. The preserved legacy code was not changed solely to add a banner because destabilizing the rollback artifact was judged riskier.

## Financial reconciliation

Fresh snapshots immediately before and after the alias switch were identical:

| Metric | Before | After |
| --- | ---: | ---: |
| Operating Cash | NOK 11,956.00 | NOK 11,956.00 |
| Total cash/assets | NOK 11,956.00 | NOK 11,956.00 |
| Net worth | NOK 11,956.00 | NOK 11,956.00 |
| Transactions | 1 | 1 |
| Ledger entries | 2 | 2 |
| Fund movements | 0 | 0 |
| Payday executions | 0 | 0 |
| Plan applications | 0 | 0 |
| Investment snapshots | 0 | 0 |
| Forecast items | 48 | 48 |
| Scenarios | 3 | 3 |

The five Funds—Emergency, Travel, Home, Family, and Fero—each remained at NOK 0.00. Five Goals, one Payday Plan with nine items, one planned October 2026 budget with four lines, and one NOK 0.00 investment account remain present. No financial migration or monetary RPC was executed during deployment.

## Legacy integrity and second-user isolation

| Legacy row | Updated at | PostgreSQL `jsonb::text` SHA-256 |
| --- | --- | --- |
| `a98dfbfd-1d8a-41fc-82c8-530ef1bc33da` | `2026-08-19T03:36:02.892Z` | `5026fad05a2c1ec8d0de9c4477b3dcf621b0c676941a6911b0c489f310370371` |
| `abc31c7e-5151-4987-ae43-a6fa192e9788` | `2026-05-10T20:31:16.156Z` | `0126a774e23036800c8b6648dabfdf84ab840a22f9fd60fd0fe2dbe274cfeefe` |

Both timestamps and checksums matched before and after deployment. The second user still has zero profiles, accounts, transactions, Funds, Goals, Payday Plans, scenarios, and investment snapshots.

## Verification

- All production deep routes returned `200` and the SPA fallback loaded on direct navigation.
- The owner authenticated on the live preview with the established email OTP flow and confirmed it worked. The captured preview showed the synchronized Transactions route and the sole NOK 11,956.00 opening transaction.
- Passwordless sign-in uses `shouldCreateUser: false`; the production and current preview origins are in the Supabase redirect allow-list.
- The root and protected routes resolve unauthenticated users to sign-in; authenticated root resolves to Overview.
- HTML uses `max-age=0, must-revalidate`; hashed assets use `max-age=31536000, immutable`.
- Runway 2 unregisters legacy service workers and deletes only `runway-pwa-*` caches on startup. Runway 2 does not register a new service worker.
- The production Settings artifact contains build `236de31`.

Automated gates: TypeScript passed; all 94 unit/UI tests passed; 18 migration tests passed; all 46 database tests passed (three PGlite-heavy files were run independently after parallel startup timeouts); all 5 Chromium Playwright flows passed, including protected routing, invented-data money workflows, nested routes, refresh, and sign-out. Production and preview checks never created active-owner test data.

Supabase database lint reported no schema errors. Security Advisor reported five migration/private tables with RLS and intentionally no browser policy, seven authenticated `SECURITY DEFINER` RPC entrypoints reviewed as the guarded product write API, and leaked-password protection disabled. The password check remains a post-cutover task because production uses passwordless email OTP and changing Auth policy at the cutover boundary was unnecessary risk. Performance Advisor findings were legacy `runway_state` auth-init-plan policies, expected overlapping select/write policies, unindexed foreign keys, and unused indexes; no risky last-minute database rewrite was made.

## Frontend rollback

From the repository root, an operator can restore the immediately previous legacy deployment:

```sh
pnpm dlx vercel@latest rollback https://runway-euqje7by1-aadhilshahjahan11-1221s-projects.vercel.app --yes --cwd runway-v2
```

Then verify `https://runway-xi.vercel.app` and run a fresh read-only financial reconciliation. This is a frontend rollback only. Do not reverse Phase 2–9 migrations, recreate an opening balance, restore legacy JSON as canonical state, or make `runway_state` authoritative. If the legacy artifact must be served temporarily, treat it as reference-only and avoid new money entry until Runway 2 is restored.
