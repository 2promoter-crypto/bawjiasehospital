-- Bawjiase Primary Hospital — Inventory Ledger
-- Run this once in your Supabase project's SQL editor (Project -> SQL Editor -> New query).

create table if not exists items (
  id text primary key,
  name text not null,
  pppu numeric not null default 0,
  sppu numeric not null default 0,
  expiry text,
  reorder_level numeric
);

create table if not exists transactions (
  id text primary key,
  date text not null,
  item_id text not null,
  type text not null,
  quantity numeric not null default 0,
  price numeric not null default 0,
  amount numeric not null default 0,
  profit numeric not null default 0,
  party text,
  by text
);

create table if not exists app_users (
  id text primary key,
  name text not null,
  username text unique not null,
  role text,
  is_admin boolean not null default false,
  approved boolean not null default true,
  pass_hash text not null,
  created_at text
);

-- If you already ran an earlier version of this schema, this adds the new
-- column without touching your existing accounts (they stay approved).
alter table app_users add column if not exists approved boolean not null default true;

-- Date-of-birth password recovery: stores only a scrambled (hashed) date.
-- Safe to re-run. Without this column, the "Forgot password?" recovery
-- cannot save dates of birth.
alter table app_users add column if not exists dob_hash text;

create table if not exists app_settings (
  key text primary key,
  value text not null
);

-- ============================================================
-- ACCESS CODE  (the database itself enforces this)
-- ============================================================
-- 1. Replace CHANGE-THIS-ACCESS-CODE below with your own long, hard-to-guess
--    code (for example four random words). Keep the single quotes.
-- 2. Run this whole file. Staff type the same code once per device.
-- To change the code later: edit it here and run ONLY this function again
-- (the "create or replace function" statement). Every device will then ask
-- for the new code.
-- Never put the code anywhere public — it is only stored inside this function.

create or replace function app_access_ok() returns boolean
language sql stable as $$
  select coalesce(current_setting('request.headers', true)::json ->> 'x-access-code', '')
         = 'CHANGE-THIS-ACCESS-CODE'
$$;

-- Row Level Security: every request must carry the access code. The app's
-- own username/password login, approvals and passwords sit on top of this.
-- (Never expose your Supabase "service_role" key in the app — only the
-- "anon public" key belongs in the HTML.)

alter table items enable row level security;
alter table transactions enable row level security;
alter table app_users enable row level security;
alter table app_settings enable row level security;

-- Remove the old open policies (safe to re-run).
drop policy if exists "anon full access" on items;
drop policy if exists "anon full access" on transactions;
drop policy if exists "anon full access" on app_users;
drop policy if exists "anon full access" on app_settings;
drop policy if exists "access code required" on items;
drop policy if exists "access code required" on transactions;
drop policy if exists "access code required" on app_users;
drop policy if exists "access code required" on app_settings;

create policy "access code required" on items for all using (app_access_ok()) with check (app_access_ok());
create policy "access code required" on transactions for all using (app_access_ok()) with check (app_access_ok());
create policy "access code required" on app_users for all using (app_access_ok()) with check (app_access_ok());
create policy "access code required" on app_settings for all using (app_access_ok()) with check (app_access_ok());

-- Live updates are sent as a small "something changed" ping between open
-- devices (no data inside it), so no realtime table publication is needed.
