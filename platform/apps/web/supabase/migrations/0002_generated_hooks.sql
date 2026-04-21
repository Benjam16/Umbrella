-- Umbrella Forge — generated hooks table
--
-- The serverless Forge pipeline writes one row per generated agent here:
-- Alchemy webhook OR direct POST /api/v1/forge/launch → verify payment →
-- Kimi 2.x → insert row → Supabase Realtime broadcasts to /app/workspace.
--
-- Apply with: pnpm supabase db push   (or paste into the Supabase SQL editor).

create table if not exists public.generated_hooks (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  tx_hash text not null,
  chain_id int not null default 8453,
  prompt text,
  solidity_code text not null,
  model text not null,
  status text not null default 'completed'
    check (status in ('queued', 'generating', 'completed', 'failed')),
  -- "Public Pulse" toggle. When true, the agent shows up in the
  -- Marketplace terminal; when false it is private to the creator's
  -- workspace. Defaults to false so users opt in explicitly.
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- If the table already existed from an earlier bootstrap, make sure the
-- is_public column is present. Idempotent.
alter table public.generated_hooks
  add column if not exists is_public boolean not null default false;

create index if not exists generated_hooks_wallet_idx
  on public.generated_hooks (wallet_address, created_at desc);

create index if not exists generated_hooks_public_idx
  on public.generated_hooks (is_public, created_at desc)
  where is_public = true;

-- Row Level Security: public rows are readable by anon; private rows are
-- owner-only (the API routes use the service role so this policy only
-- constrains direct Realtime subscribers).
alter table public.generated_hooks enable row level security;

drop policy if exists generated_hooks_read_public on public.generated_hooks;
create policy generated_hooks_read_public on public.generated_hooks
  for select
  using (is_public = true);

-- Realtime: creators see their own INSERTs as they happen (service-role
-- bypasses RLS). For the "Instant Workspace Replay" we filter in the
-- client by wallet_address.
