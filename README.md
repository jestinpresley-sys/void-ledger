# Void Ledger

A Warframe companion for tracking what you own, planning Prime farms and saving builds.

- **Collection** – every Warframe, weapon, companion and vehicle, marked Need / Own / Mastered, with mastery totals and links to where missing items drop.
- **Builds** – a mod editor with real capacity math: slot polarities and Forma, aura and stance bonuses, mod ranks, exilus, arcanes, Archon Shards (including Tauforged) and Helminth. Save builds, share them by link, and browse builds other players made public.
- **Where to farm** – drop chances for about 3,000 items, mods, Prime parts and relics, with the number of runs for a 90% chance.
- **Prime sets** – tick off parts you own; vaulted relics are marked.
- **Fissures** – live Void Fissures (normal, Steel Path, Void Storms), with the tiers you need for your wishlist highlighted and a ranked list of relics to crack.
- **Wishlist** – what you're chasing, with the best source for each.

Without accounts set up, everything saves in the browser. With Supabase set up, players sign in by email link or Discord and their data follows them across devices.

## Run it

Needs Node 22.12 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

That's enough to use the app with browser-only saving.

## Turn on accounts (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and run it.
3. Open **Project Settings → API**, then copy `.env.example` to `.env` and fill in:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
4. **Authentication → URL Configuration**: set *Site URL* to where the app runs (`http://localhost:5173` while developing, your real domain once deployed) and add both to *Redirect URLs*.
5. Optional Discord login: **Authentication → Providers → Discord**. Create an app at the [Discord Developer Portal](https://discord.com/developers/applications), add the callback URL Supabase shows you as a redirect there, and paste the client ID and secret into Supabase.
6. Restart `npm run dev`.

Row-level security is on for every table: players can only read and change their own rows. Builds marked public and display names are readable by anyone.

## Deploy

It's a static site. `npm run build` writes `dist/`.

- **Vercel**: import the repo; the framework preset is Vite. Add the two `VITE_SUPABASE_*` variables under Environment Variables. `vercel.json` handles page routes.
- **Netlify**: build command `npm run build`, publish directory `dist`, same env variables. `public/_redirects` handles page routes.
- **GitHub Pages** works too, but needs a 404.html copy of index.html for deep links.

After deploying, add the live URL to Supabase's Site URL and Redirect URLs (step 4 above).

## Refresh game data

Game data lives in `public/data/` and is generated, not hand-written:

```bash
npm run data
```

| File | Source |
| --- | --- |
| `drops.json` | Official PC drop tables via [WFCD/warframe-drop-data](https://github.com/WFCD/warframe-drop-data), downloaded each run |
| `collection.json`, `mods.json`, `arcanes.json` | the `@wfcd/items` package (bump its version first to get new items) |
| `shards.json` | the `warframe-worldstate-data` package |

Run it after each Warframe update, then commit the changed files. Item images load from `cdn.warframestat.us`; live fissures come from `api.warframestat.us`.

## Tests

```bash
npm test           # capacity math, mod compatibility, share links
npm run typecheck
```

## Known gaps

- Helminth lists every ability of each donor frame; the app doesn't yet know which single ability each frame gives Helminth, or Helminth's own abilities.
- Melee stance slots accept any stance; the data doesn't say which weapon class each melee weapon belongs to.
- Build stats show base Warframe values; they don't yet apply mod, shard or arcane bonuses.
- Rivens, Kitgun/Zaw parts, Railjack and Operator/Amp builds aren't covered.
