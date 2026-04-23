-- Umbrella market ingest idempotency
--
-- Makes ingest safe to replay by introducing a deterministic idempotency key
-- and a supporting unique index.

alter table public.market_trades
  add column if not exists source_chain_id int,
  add column if not exists log_index int,
  add column if not exists idempotency_key text;

create unique index if not exists market_trades_idempotency_key_idx
  on public.market_trades (idempotency_key)
  where idempotency_key is not null;

