import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client. Uses the service role key so API routes can
 * write runs / events regardless of auth state. NEVER import this from a
 * client component.
 */
let cached: SupabaseClient | null = null;
let cachedStub = false;
let warnedBadUrl = false;

function normalizeSupabaseUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    // Supabase project URL should be origin-only (optionally trailing slash).
    // Common misconfig is pasting REST endpoint like ".../rest/v1".
    if (u.pathname && u.pathname !== "/") return null;
    return `${u.origin}`;
  } catch {
    return null;
  }
}

export function getServerSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    // Fall back to anon only for local dev; service role is strongly recommended.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const url = rawUrl ? normalizeSupabaseUrl(rawUrl) : null;
  if (rawUrl && !url && !warnedBadUrl) {
    warnedBadUrl = true;
    console.warn(
      "[umbrella] Invalid SUPABASE_URL. Use your project base URL only (e.g. https://<project-ref>.supabase.co), not a REST path like /rest/v1.",
    );
  }

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
