-- Node pairing migration (Phase 1).
--
-- Binds the CLI-minted pairing code to a browser owner, then authenticates
-- subsequent CLI → server requests by comparing sha256(bearer_token) to the
-- token_hash column. This is the Phase 1 "shared secret" approach; Phase 2
-- will add ed25519 keypair auth alongside (hence the existing public_key
-- column is kept but made optional).
--
-- Apply with:  supabase db push
--          or: paste into the Supabase SQL editor after schema.sql.

-- ---------------------------------------------------------------------------
-- 1. Grow the `nodes` table with pairing fields.
-- ---------------------------------------------------------------------------
alter table public.nodes
  add column if not exists node_id text,
  add column if not exists hostname text,
  add column if not exists token_hash text,
  add column if not exists pairing_code text,
  add column if not exists pairing_expires_at timestamptz,
  add column if not exists paired boolean not null default false,
  add column if not exists last_heartbeat_at timestamptz;

-- Phase 1 uses token-hash auth; Phase 2 will add an ed25519 pubkey alongside.
-- Drop NOT NULL on public_key so rows minted via `umbrella connect` don't
-- need one.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nodes'
      and column_name = 'public_key'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.nodes alter column public_key drop not null';
  end if;
end $$;

-- Also relax the owner_fingerprint NOT NULL constraint during the pending
-- phase — the CLI announces without an owner; the browser claims it later.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nodes'
      and column_name = 'owner_fingerprint'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.nodes alter column owner_fingerprint drop not null';
  end if;
end $$;

-- The CLI-supplied human-readable id (e.g. `node-abc1`). Unique so a given
-- machine can't announce two live identities at once.
create unique index if not exists nodes_node_id_unique
  on public.nodes (node_id)
  where node_id is not null;

-- Only one active pairing code at a time (pending pairings only — we clear
-- the column on claim).
create unique index if not exists nodes_pairing_code_unique
  on public.nodes (pairing_code)
  where pairing_code is not null;

create index if not exists nodes_paired_idx on public.nodes (paired, owner_fingerprint);

-- ---------------------------------------------------------------------------
-- 2. RLS: add an "owner reads own nodes" read policy so client-side lookups
--    with a cookie-derived fingerprint still work (service role bypasses RLS
--    so writes remain fine).
-- ---------------------------------------------------------------------------
drop policy if exists nodes_read_own on public.nodes;
-- Kept for future use when the website reads Supabase directly from the
-- browser. All current reads go through the service role.
-- create policy nodes_read_own on public.nodes
--   for select
--   using (paired = true);
