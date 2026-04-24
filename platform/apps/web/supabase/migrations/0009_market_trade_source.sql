-- 0009_market_trade_source.sql
--
-- Add a `source` column to market_trades so the UI can distinguish pump.fun
-- style bonding-curve swaps from post-graduation Uniswap v4 pool swaps.
--
-- Safe to re-run.

alter table public.market_trades
  add column if not exists source text not null default 'pool'
  check (source in ('pool','curve'));

create index if not exists market_trades_hook_source_traded_at_idx
  on public.market_trades (hook_id, source, traded_at desc);
