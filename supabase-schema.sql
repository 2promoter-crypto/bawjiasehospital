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

create table if not exists app_settings (
  key text primary key,
  value text not null
);

-- Row Level Security: the app already protects itself with its own
-- username/password login and its own separate app-open / items-export
-- passwords, so we allow the app's anon key full read/write access here.
-- (Never expose your Supabase "service_role" key in this file — only the
-- "anon public" key belongs in the HTML.)

alter table items enable row level security;
alter table transactions enable row level security;
alter table app_users enable row level security;
alter table app_settings enable row level security;

create policy "anon full access" on items for all using (true) with check (true);
create policy "anon full access" on transactions for all using (true) with check (true);
create policy "anon full access" on app_users for all using (true) with check (true);
create policy "anon full access" on app_settings for all using (true) with check (true);
