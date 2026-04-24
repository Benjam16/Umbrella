import { getAgentImageUrl } from "@/lib/supabase-client";

/** Same as {@link getAgentImageUrl}; alias used by the forge wizard. */
export function resolvePublicAssetUrl(url: string | null | undefined): string {
  return getAgentImageUrl(url ?? "");
}
