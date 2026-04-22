-- Umbrella Forge — Fork attribution
--
-- When a user clicks "Fork this agent" on a public marketplace listing and
-- completes the wizard, the new `generated_hooks` row records the parent it
-- was derived from. This unlocks:
--   · A "Forks" count on the creator's workspace card (proof of reuse).
--   · Creator-earnings leaderboards that reward originals over forks.
--   · Lineage graphs for every public hook.
--
-- Apply with: pnpm supabase db push.

alter table public.generated_hooks
  add column if not exists forked_from uuid
    references public.generated_hooks (id) on delete set null;

-- Single-row counts are read frequently (every public workspace card asks
-- "how many forks do I have?"), so index the FK.
create index if not exists generated_hooks_forked_from_idx
  on public.generated_hooks (forked_from)
  where forked_from is not null;
