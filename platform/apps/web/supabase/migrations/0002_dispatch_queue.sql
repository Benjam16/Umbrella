-- Mission dispatch queue (Phase 1).
--
-- When the browser says "Run this blueprint on my laptop", the web creates a
-- queued run tagged with `target_node_id`. The paired CLI long-polls the
-- heartbeat endpoint, claims the run, executes it locally, and streams
-- events back. Same RunRecord shape, same SSE UI — just a different
-- executor.
--
-- Apply with:  supabase db push
--          or: paste into the Supabase SQL editor after 0001_node_pairing.sql.

alter table public.runs
  add column if not exists target_node_id text,         -- nodes.node_id (human id), not uuid
  add column if not exists dispatched_at timestamptz,
  add column if not exists claimed_at timestamptz;

-- Fast lookup of pending dispatches for a given node:
--   SELECT * FROM runs
--   WHERE target_node_id = $1
--     AND claimed_at IS NULL
--     AND status = 'queued';
create index if not exists runs_pending_dispatches_idx
  on public.runs (target_node_id, status, claimed_at)
  where target_node_id is not null;

-- Owner-scoped history listing (`GET /api/v1/runs` for the current browser).
-- Already partially covered by runs_owner_fingerprint_idx, but this variant
-- makes the paired "my runs" view constant-time regardless of blueprint.
create index if not exists runs_owner_created_idx
  on public.runs (owner_fingerprint, created_at desc);
