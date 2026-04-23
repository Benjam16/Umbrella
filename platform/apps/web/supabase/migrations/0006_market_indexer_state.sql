-- Umbrella market indexer cursor checkpoints
--
-- Stores per-indexer watermarks so relayer/indexer loops resume from the
-- exact block after restarts and avoid repeated lookback scans.

create table if not exists public.market_indexer_state (
  id text primary key,
  cursor_block bigint not null default 0,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.market_indexer_state enable row level security;

drop policy if exists market_indexer_state_public_read on public.market_indexer_state;
create policy market_indexer_state_public_read
  on public.market_indexer_state
  for select
  using (false);

