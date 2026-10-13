-- Void Ledger database schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement checks for existing objects.

-- Public display name shown on shared builds.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- Frames, weapons, companions and vehicles a player has. One row per item they've marked.
create table if not exists public.collection_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id text not null,                       -- the game's uniqueName, e.g. /Lotus/Powersuits/Rhino/Rhino
  status text not null check (status in ('owned', 'mastered')),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Prime parts the player owns (for set planning).
create table if not exists public.owned_parts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  part_name text not null,                     -- e.g. "Voruna Prime Chassis Blueprint"
  created_at timestamptz not null default now(),
  primary key (user_id, part_name)
);

-- Things the player is farming for.
create table if not exists public.wishlist (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,                          -- an item, Prime part, Prime set or relic name
  done boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (user_id, name)
);

-- Saved builds. The loadout itself (mods, arcanes, shards…) lives in `data`.
create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id text not null,
  item_name text not null,
  item_cat text not null,                      -- warframe, primary, secondary, melee, …
  title text not null check (char_length(title) between 1 and 80),
  notes text not null default '' check (char_length(notes) <= 4000),
  data jsonb not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists builds_user_idx on public.builds (user_id, updated_at desc);
create index if not exists builds_public_item_idx on public.builds (item_id, updated_at desc) where is_public;

-- Keep updated_at honest.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists builds_touch on public.builds;
create trigger builds_touch before update on public.builds for each row execute function public.touch_updated_at();
drop trigger if exists collection_touch on public.collection_items;
create trigger collection_touch before update on public.collection_items for each row execute function public.touch_updated_at();

-- Row level security: everyone only sees and edits their own rows,
-- except builds marked public and profile names, which anyone can read.
alter table public.profiles enable row level security;
alter table public.collection_items enable row level security;
alter table public.owned_parts enable row level security;
alter table public.wishlist enable row level security;
alter table public.builds enable row level security;

do $$
declare t text;
begin
  foreach t in array array['collection_items', 'owned_parts', 'wishlist'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select using (true);
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "read own or public builds" on public.builds;
create policy "read own or public builds" on public.builds for select using (is_public or user_id = auth.uid());
drop policy if exists "write own builds" on public.builds;
create policy "write own builds" on public.builds for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update own builds" on public.builds;
create policy "update own builds" on public.builds for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete own builds" on public.builds;
create policy "delete own builds" on public.builds for delete to authenticated using (user_id = auth.uid());
