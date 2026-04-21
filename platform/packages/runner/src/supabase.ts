import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client. Uses the service role key so API routes can
 * write runs / events regardless of auth state. NEVER import this from a
 * client component.
 */
let cached: SupabaseClient | null = null;
let cachedStub = false;

export function getServerSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    // Fall back to anon only for local dev; service role is strongly recommended.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (!cachedStub) {
      cachedStub = true;
      console.warn(
        "[umbrella] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — running in memory-only mode. Set them to persist runs.",
      );
    }
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-umbrella-client": "website-api" } },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ??
        process.env.SUPABASE_SERVICE_ROLE ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
