-- KahanDekhu — cloud sync schema (Supabase / Postgres)
-- Run this in the Supabase SQL Editor.
--
-- SECURITY MODEL: Row Level Security (RLS) is what protects the data.
-- Every policy restricts access to rows where auth.uid() = user_id, so a
-- signed-in user can only ever read/write THEIR OWN preferences and watchlist —
-- even though the anon key is public in the app. Do NOT disable RLS.

-- ---------- preferences: one row per user ----------
create table if not exists public.preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  region     text not null default 'IN',
  services   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- watchlist: many rows per user ----------
create table if not exists public.watchlist (
  user_id     uuid not null references auth.users(id) on delete cascade,
  tmdb_id     integer not null,
  media_type  text not null,
  title       text not null,
  poster_path text,
  added_at    timestamptz not null default now(),
  primary key (user_id, tmdb_id, media_type)
);

-- ---------- enable Row Level Security ----------
alter table public.preferences enable row level security;
alter table public.watchlist   enable row level security;

-- ---------- policies: users can only access their own rows ----------
drop policy if exists "own preferences" on public.preferences;
create policy "own preferences" on public.preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist" on public.watchlist
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- grants (RLS still gates the actual rows) ----------
grant select, insert, update, delete on public.preferences to authenticated;
grant select, insert, update, delete on public.watchlist   to authenticated;
-- anon (logged-out) gets nothing on these tables.
