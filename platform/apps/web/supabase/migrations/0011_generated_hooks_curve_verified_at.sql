-- Track Basescan verification for the bonding curve contract separately from
-- the mission record (`verified_at`).

alter table public.generated_hooks
  add column if not exists curve_verified_at timestamptz;
