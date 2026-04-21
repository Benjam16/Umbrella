import { timingSafeEqual } from "node:crypto";

/**
 * Gate for relayer-only endpoints (`/api/v1/relayer/pending`, anchor writes).
 * The relayer authenticates with a platform-level bearer secret — this is a
 * server-to-server identity, NOT a user session, so it bypasses the owner
 * cookie entirely.
 *
 * In production, prefer mTLS or a signed-JWT variant. For dev, a shared
 * secret in the environment is enough and avoids Supabase round-trips.
 *
 * Configure with `UMBRELLA_RELAYER_SECRET`. When unset, the routes refuse
 * all calls — the relayer worker detects this and runs in "dry-run" mode.
 */
export function verifyRelayerSecret(headers: Headers): {
  ok: boolean;
  reason?: "missing_config" | "missing_header" | "mismatch";
} {
  const expected = process.env.UMBRELLA_RELAYER_SECRET;
  if (!expected) return { ok: false, reason: "missing_config" };

  const header = headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { ok: false, reason: "missing_header" };
  }
  const provided = header.slice("Bearer ".length).trim();
  if (provided.length !== expected.length) {
    return { ok: false, reason: "mismatch" };
  }
  const ok = timingSafeEqual(
    Buffer.from(provided, "utf8"),
    Buffer.from(expected, "utf8"),
  );
  return ok ? { ok: true } : { ok: false, reason: "mismatch" };
}
