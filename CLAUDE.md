# Void Ledger — notes for Claude Code

Warframe collection tracker, farming planner and build editor. Vite + React 19 + TypeScript, Supabase for accounts. No backend server of our own.

## Commands
- `npm run dev` — dev server
- `npm test` — vitest (capacity math, mod compatibility, share codes; builds.test.ts reads public/data)
- `npm run typecheck` / `npm run build`
- `npm run data` — regenerate public/data/*.json (drop tables download from GitHub; items from node_modules)

## Layout
- `scripts/build-data.mjs` — the only place game data is shaped. Change output shapes here and in `src/lib/data.ts` together.
- `src/lib/data.ts` — data types + loader (fetches /data/*.json once).
- `src/lib/capacity.ts` — mod capacity rules. Keep tests in `capacity.test.ts` in step with any rule change.
- `src/lib/builds.ts` — BuildData shape (`version: 1`), slot layouts per category, which mods/arcanes fit which item, share-code encoding. If BuildData changes, bump `version` and migrate old builds on load; saved builds and share links contain it.
- `src/lib/store.tsx` — user data. Signed in → Supabase tables; signed out → localStorage key `void-ledger:v1`. Mutations are optimistic.
- `src/lib/fissures.ts` — live fissures from api.warframestat.us.
- `src/pages/*` — one file per route; `src/components/ui.tsx` holds shared bits (game data context, toast, art, polarity glyphs).
- `supabase/schema.sql` — tables + RLS. Re-runnable.

## Conventions
- Colors only through the CSS tokens in `src/styles.css` (light and dark both defined there).
- Item identity is the game's `uniqueName` (`/Lotus/...`), stored as `item_id`. Prime parts, wishlist entries and relics are keyed by display name, matching the drop tables.
- Don't commit `.env`.
