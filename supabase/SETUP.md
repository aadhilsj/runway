# Supabase Setup

1. Open the Supabase SQL editor.
2. Run the SQL in `supabase/schema.sql`.
3. Go to `Authentication` -> `URL Configuration`.
4. Set:
   - `Site URL`: `https://runway-xi.vercel.app`
   - `Redirect URLs`: add `https://runway-xi.vercel.app`
5. Keep email magic links enabled in Auth.

Notes:
- The frontend uses the publishable key in `config.js`.
- The secret/service-role key is not used in the browser.
- The app stores one per-user JSON state record in `public.runway_state`.
- Local cache still exists for fast startup, but Supabase is the canonical source.
