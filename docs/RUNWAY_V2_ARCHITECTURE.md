# Runway 2 architecture

Runway 2 is an isolated React Router Framework Mode SPA in `runway-v2/`. The root legacy files remain the deployable application until a separately approved cutover.

## Boundaries

- `app/domain/` contains pure TypeScript. It must not import React, Supabase, Recharts, browser globals, or route modules.
- `app/data/` owns Supabase and TanStack Query integration. Generated database types live in `app/data/database.types.ts` and are regenerated from the linked project, never hand-edited.
- `app/read-models/` defines screen-shaped projections. Charts receive read-model data; they do not calculate financial truth.
- `app/auth/` restores the Supabase session and exposes the minimum auth state/actions.
- `app/routes/` composes page modules. Remote server state belongs in TanStack Query; ephemeral controls stay local; shareable filters belong in the URL.
- `app/components/` and `app/styles/` implement the shell and tokens without a UI framework.

## Runtime flow

The root creates one QueryClient, restores the Supabase session, then allows the protected layout to render. `/` redirects to `/overview`; `/money` redirects to `/money/transactions`. Financial routes redirect unauthenticated users to `/sign-in` and preserve the intended destination.

No route reads `public.runway_state` in Phase 1. This prevents accidental coupling to the blob while the normalized schema and migration remain unapproved.

## State ownership

- Supabase: authenticated durable remote data in Phase 2.
- TanStack Query: remote cache and mutations.
- URL search parameters: filters, ranges, and selected scenario IDs that should survive refresh/share.
- Component state: menus, focus, disclosure, draft interaction.
- React Hook Form + Zod: form state and validation.

Global client stores are intentionally absent.
