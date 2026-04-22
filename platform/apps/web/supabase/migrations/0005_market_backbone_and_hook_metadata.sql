-- Umbrella market backbone + canonical token metadata
--
-- Phase 1: persistent market data tables for live token feeds
-- Phase 3: canonical token/pool/hook addresses on generated_hooks
--
-- Apply with: pnpm supabase db push

-- ---------------------------------------------------------------------------
-- Canonical market metadata per launch row
-- ---------------------------------------------------------------------------
alter table public.generated_hooks
  add column if not exists token_address text,
  add column if not exists pool_address text,
  add column if not exists hook_address text;

create index if not exists generated_hooks_token_address_idx
  on public.generated_hooks (token_address)
  where token_address is not null;

-- ---------------------------------------------------------------------------
-- Market tape + candle storage
-- ---------------------------------------------------------------------------
create table if not exists public.market_trades (
  id uuid primary key default gen_random_uuid(),
  hook_id uuid not null references public.generated_hooks (id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  price_usd numeric not null check (price_usd >= 0),
  size_usd numeric not null check (size_usd >= 0),
  tx_hash text,
  block_number bigint,
  traded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists market_trades_hook_traded_at_idx
  on public.market_trades (hook_id, traded_at desc);

create table if not exists public.market_candles_1m (
  hook_id uuid not null references public.generated_hooks (id) on delete cascade,
  bucket timestamptz not null,
  open numeric not null check (open >= 0),
  high numeric not null check (high >= 0),
  low numeric not null check (low >= 0),
  close numeric not null check (close >= 0),
  volume_usd numeric not null default 0 check (volume_usd >= 0),
  trades_count int not null default 0 check (trades_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (hook_id, bucket)
);

create index if not exists market_candles_1m_hook_bucket_desc_idx
  on public.market_candles_1m (hook_id, bucket desc);

-- ---------------------------------------------------------------------------
-- Portfolio seeds (Phase 5)
-- ---------------------------------------------------------------------------
create table if not exists public.user_trade_intents (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  hook_id uuid not null references public.generated_hooks (id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  amount_usd numeric not null check (amount_usd > 0),
  token_amount numeric,
  status text not null default 'queued'
    check (status in ('queued', 'submitted', 'confirmed', 'failed')),
  tx_hash text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists user_trade_intents_wallet_created_idx
  on public.user_trade_intents (wallet_address, created_at desc);

-- Read access for public market data
alter table public.market_trades enable row level security;
alter table public.market_candles_1m enable row level security;

drop policy if exists market_trades_public_read on public.market_trades;
create policy market_trades_public_read on public.market_trades
  for select using (true);

drop policy if exists market_candles_public_read on public.market_candles_1m;
create policy market_candles_public_read on public.market_candles_1m
  for select using (true);

