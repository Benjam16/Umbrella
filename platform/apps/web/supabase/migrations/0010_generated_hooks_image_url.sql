-- Canonical branding path or URL for marketplace / workspace (Forge identity.imageUrl).
alter table public.generated_hooks
  add column if not exists image_url text;

comment on column public.generated_hooks.image_url is
  'Optional agent image: Supabase storage path, https URL, or empty.';
