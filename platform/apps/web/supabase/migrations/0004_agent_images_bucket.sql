-- Umbrella Forge — agent image uploads
--
-- The Forge wizard lets creators upload a token image instead of pasting a
-- URL. The upload endpoint (`POST /api/v1/forge/image`) creates the bucket
-- lazily from Node using the service-role key, so strictly speaking this
-- migration is not required. It's kept here as a declarative record:
--
--   · Bucket name: `agent-images`
--   · Visibility:  public (objects are served via the CDN URL)
--   · Max size:    2 MB per object (enforced in the API route)
--
-- Apply with: pnpm supabase db push   (or copy into the Supabase SQL editor).
--
-- The `insert` is idempotent — rerunning the migration will not raise.

insert into storage.buckets (id, name, public)
values ('agent-images', 'agent-images', true)
on conflict (id) do update set public = excluded.public;

-- Allow anonymous reads of public object URLs (redundant for `public = true`
-- buckets, but makes the RLS intent explicit for future auditors).
drop policy if exists "agent_images_public_read" on storage.objects;
create policy "agent_images_public_read"
  on storage.objects for select
  using (bucket_id = 'agent-images');
