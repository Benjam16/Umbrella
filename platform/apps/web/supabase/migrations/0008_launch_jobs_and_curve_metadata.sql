-- 0008_launch_jobs_and_curve_metadata.sql
--
-- Introduces the pump.fun-style launch pipeline state:
--   • Additional columns on generated_hooks for curve metadata + Basescan verification status
--   • A dedicated launch_jobs audit-trail table so the UI can show step-by-step progress
--
-- This migration is additive and idempotent. It does not touch existing rows.

alter table public.generated_hooks
  add column if not exists curve_address text,
  add column if not exists curve_stage text not null default 'pending',
  add column if not exists graduated_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verify_guid text,
  add column if not exists deploy_error text,
  add column if not exists mission_code_hash text,
  add column if not exists metadata_uri text;

-- Normalise stages: pending | deploying | active | graduated | failed.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'generated_hooks_curve_stage_check'
  ) then
    alter table public.generated_hooks
      add constraint generated_hooks_curve_stage_check
      check (curve_stage in ('pending','deploying','active','graduated','failed'));
  end if;
end $$;

create index if not exists idx_generated_hooks_curve_stage
  on public.generated_hooks (curve_stage);

create table if not exists public.launch_jobs (
  id uuid primary key default gen_random_uuid(),
  hook_id uuid references public.generated_hooks(id) on delete cascade,
  step text not null,
  status text not null,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_launch_jobs_hook on public.launch_jobs (hook_id, updated_at desc);

alter table public.launch_jobs enable row level security;

-- The web app uses the service role for all writes; no anon write policy.
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'launch_jobs_read') then
    create policy launch_jobs_read
      on public.launch_jobs
      for select
      using (true);
  end if;
end $$;
