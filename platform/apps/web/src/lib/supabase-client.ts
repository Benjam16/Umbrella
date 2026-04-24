import { getBrowserSupabase } from "./supabase-browser";

const BUCKET = "agent-images";

/**
 * Resolves a storage path in `agent-images` to a public URL, or passes through
 * absolute `https?://` values. Use for forge-uploaded and legacy path-only URLs.
 */
export function getAgentImageUrl(path: string | null | undefined): string {
  const v = (path ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const normalized = v.replace(/^\//, "");
  const supabase = getBrowserSupabase();
  if (supabase) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return v;
  return `${base}/storage/v1/object/public/${BUCKET}/${normalized}`;
}
