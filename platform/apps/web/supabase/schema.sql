-- Umbrella Cloud Sandbox schema
-- Apply with:  supabase db push    (or paste into the Supabase SQL editor)
--
-- Philosophy: the website stores run metadata + append-only event log.
-- Blueprints are defined in code (src/lib/runner/blueprints.ts) so product
-- iteration doesn't require a migration. Artifacts (large JSON/MD) live in
-- Supabase Storage, not Postgres.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- runs: one row per mission the cloud supervisor executes.
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  blueprint_id text not null,
  goal text not null,
  mode text not null check (mode in ('cloud', 'remote')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'ejected', 'canceled')),
  risk_threshold int not null default 5 check (risk_threshold between 1 and 10),
  inputs jsonb not null default '{}'::jsonb,
  summary text,
  error text,
  owner_fingerprint text,        -- anonymous visitor id when unauthenticated
  owner_user_id uuid,            -- populated when Supabase Auth is wired up
  node_id uuid,                  -- set when executed on a registered local node
  workspace_id uuid,             -- optional project grouping
  credits_spent int not null default 0,
  share_token text unique,       -- set when user enables read-only share link
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists runs_owner_fingerprint_idx on public.runs (owner_fingerprint, created_at desc);
create index if not exists runs_status_idx on public.runs (status);
create index if not exists runs_created_at_idx on public.runs (created_at desc);

-- ---------------------------------------------------------------------------
-- run_events: append-only log streamed to the WebRunner over SSE.
-- Every UI state transition (node started/finished, log line, artifact ready,
-- eject requested, signature request) lands here.
-- ---------------------------------------------------------------------------
create table if not exists public.run_events (
  id bigserial primary key,
  run_id uuid not null references public.runs(id) on delete cascade,
  seq int not null,              -- monotonically increasing per run
  kind text not null,            -- plan | node.start | node.log | node.finish | artifact | eject.requested | signature.requested | run.finish | run.error
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create index if not exists run_events_run_id_seq_idx on public.run_events (run_id, seq);

-- ---------------------------------------------------------------------------
-- credits_ledger: "Public Credits" rate-limit + billing primitive.
-- A row is inserted on every run. The sandbox refuses new runs when the sum
-- of `spent - granted` over the last 24h exceeds the visitor's allowance.
-- ---------------------------------------------------------------------------
create table if not exists public.credits_ledger (
  id bigserial primary key,
  owner_fingerprint text not null,
  owner_user_id uuid,
  delta int not null,            -- positive = grant, negative = spend
  reason text not null,          -- 'daily_grant' | 'run_spend' | 'bonus' | 'refund'
  run_id uuid references public.runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists credits_owner_idx on public.credits_ledger (owner_fingerprint, created_at desc);

-- ---------------------------------------------------------------------------
-- nodes: registered local Umbrella CLIs the website can dispatch missions to.
-- A user runs `umbrella connect` which mints a JWT and stores the public key
-- here. The website then calls the node over a WebSocket bridge.
-- ---------------------------------------------------------------------------
create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  owner_fingerprint text not null,
  owner_user_id uuid,
  label text not null,
  public_key text not null,      -- ed25519 pubkey (base64)
  local_url text,                -- optional: tunneled URL when reachable directly
  last_seen_at timestamptz,
  status text not null default 'offline' check (status in ('online', 'offline', 'revoked')),
  created_at timestamptz not null default now()
);

create index if not exists nodes_owner_idx on public.nodes (owner_fingerprint);

-- ---------------------------------------------------------------------------
-- workspaces: "Companies / Projects" for multi-tenant dashboard.
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid,
  owner_fingerprint text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security. For Phase 1 we only enable permissive anon-read on
-- share-tokened rows and let the service role handle writes from the API.
-- ---------------------------------------------------------------------------
alter table public.runs enable row level security;
alter table public.run_events enable row level security;
alter table public.credits_ledger enable row level security;
alter table public.nodes enable row level security;
alter table public.workspaces enable row level security;

-- Anyone with a share_token can read that run + its events (read-only view).
drop policy if exists runs_read_shared on public.runs;
create policy runs_read_shared on public.runs
  for select
  using (share_token is not null);

drop policy if exists run_events_read_shared on public.run_events;
create policy run_events_read_shared on public.run_events
  for select
  using (
    exists (
      select 1 from public.runs r
      where r.id = run_events.run_id and r.share_token is not null
    )
  );

-- All writes go through the service role (API routes use SUPABASE_SERVICE_ROLE_KEY).
-- Add authenticated-user policies once Supabase Auth is wired.
