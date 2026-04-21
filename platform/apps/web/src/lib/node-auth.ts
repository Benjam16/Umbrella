import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getServerSupabase } from "@umbrella/runner/supabase";

/**
 * Server-side identity + pairing for Umbrella Remote Nodes.
 *
 * Phase 1 design (intentionally simple, intentionally secure):
 *
 *   1. `umbrella connect` mints {nodeId, nodeToken, pairingCode} locally and
 *      POSTs an **announcement** to the web. The announcement stores
 *      sha256(nodeToken) — the raw token never leaves the CLI.
 *   2. User pastes the 6-char pairing code into /app/nodes. The web promotes
 *      the pending announcement to an owned node (owner = cookie id), and
 *      clears the pairing code.
 *   3. Future CLI → web requests send `Authorization: Bearer <nodeToken>` +
 *      `X-Umbrella-Node-Id: <nodeId>`. The server rehashes the token and
 *      compares to `token_hash`. No match ⇒ 401.
 *
 * Falls back to an in-process Map when Supabase isn't configured so the
 * whole dance works in `next dev` without a database.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type NodeRecord = {
  /** UUID primary key in Supabase. */
  id: string;
  /** Human-readable id minted by the CLI (e.g. "node-abc1"). Unique while alive. */
  nodeId: string;
  ownerFingerprint: string | null;
  label: string;
  hostname: string | null;
  tokenHash: string;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  paired: boolean;
  status: "online" | "offline" | "revoked";
  lastSeenAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
};

export type PublicNodeRecord = Pick<
  NodeRecord,
  | "id"
  | "nodeId"
  | "label"
  | "hostname"
  | "status"
  | "lastSeenAt"
  | "lastHeartbeatAt"
  | "paired"
  | "createdAt"
>;

export function toPublicNode(n: NodeRecord): PublicNodeRecord {
  return {
    id: n.id,
    nodeId: n.nodeId,
    label: n.label,
    hostname: n.hostname,
    status: n.status,
    lastSeenAt: n.lastSeenAt,
    lastHeartbeatAt: n.lastHeartbeatAt,
    paired: n.paired,
    createdAt: n.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Owner cookie — per-browser stable id used while Supabase Auth is offline.
// ---------------------------------------------------------------------------

const OWNER_COOKIE = "umbrella_owner";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Read the owner cookie, or return null if not set yet. Use together with
 * `setOwnerCookie(id)` on the first write. Next.js app-router cookies are
 * accessed via `next/headers`.
 */
export async function readOwnerCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(OWNER_COOKIE)?.value ?? null;
}

/**
 * Return the existing owner id, or mint a new one and persist it in the
 * cookie jar (via `next/headers`, which is writable from Route Handlers).
 */
export async function ensureOwner(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(OWNER_COOKIE)?.value;
  if (existing && /^[a-f0-9]{24,}$/.test(existing)) return existing;

  const fresh = randomBytes(16).toString("hex");
  jar.set(OWNER_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return fresh;
}

// ---------------------------------------------------------------------------
// Storage backend: Supabase when configured, otherwise an in-memory Map.
// The two paths return the same shapes so callers don't need to branch.
// ---------------------------------------------------------------------------

// Pin the memory store to globalThis so every Next.js route bundle shares
// the same Map. Without this, `webpack` gives each route handler its own
// module copy and announce/pair/heartbeat all see empty maps.
const memoryStore = globalThis as unknown as {
  __umbrellaMemoryNodes?: Map<string, NodeRecord>;
};
const memoryNodes: Map<string, NodeRecord> =
  memoryStore.__umbrellaMemoryNodes ?? new Map();
memoryStore.__umbrellaMemoryNodes = memoryNodes;

function rowToNode(row: Record<string, unknown>): NodeRecord {
  return {
    id: String(row.id),
    nodeId: row.node_id == null ? String(row.id) : String(row.node_id),
    ownerFingerprint: (row.owner_fingerprint as string | null) ?? null,
    label: (row.label as string) ?? "",
    hostname: (row.hostname as string | null) ?? null,
    tokenHash: (row.token_hash as string) ?? "",
    pairingCode: (row.pairing_code as string | null) ?? null,
    pairingExpiresAt: (row.pairing_expires_at as string | null) ?? null,
    paired: Boolean(row.paired),
    status: (row.status as NodeRecord["status"]) ?? "offline",
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    lastHeartbeatAt: (row.last_heartbeat_at as string | null) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Announce: CLI → server. Creates a *pending* node row with a pairing code
// and a token hash. Owner is null until someone claims it.
// ---------------------------------------------------------------------------

export type AnnounceInput = {
  nodeId: string;
  pairingCode: string;
  tokenHash: string;
  hostname?: string | null;
  label?: string | null;
};

const PAIRING_TTL_MS = 15 * 60 * 1000; // 15 min

export async function announceNode(input: AnnounceInput): Promise<NodeRecord> {
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const supabase = getServerSupabase();

  if (!supabase) {
    // In-memory path — upsert by nodeId.
    const existing = [...memoryNodes.values()].find((n) => n.nodeId === input.nodeId);
    const base: NodeRecord = existing ?? {
      id: crypto.randomUUID(),
      nodeId: input.nodeId,
      ownerFingerprint: null,
      label: input.label ?? input.nodeId,
      hostname: input.hostname ?? null,
      tokenHash: input.tokenHash,
      pairingCode: input.pairingCode,
      pairingExpiresAt: expiresAt,
      paired: false,
      status: "offline",
      lastSeenAt: null,
      lastHeartbeatAt: null,
      createdAt: new Date().toISOString(),
    };
    const updated: NodeRecord = {
      ...base,
      tokenHash: input.tokenHash,
      pairingCode: input.pairingCode,
      pairingExpiresAt: expiresAt,
      label: input.label ?? base.label,
      hostname: input.hostname ?? base.hostname,
      // Re-announce un-pairs so the browser claims the rotated secret.
      paired: false,
      ownerFingerprint: null,
    };
    memoryNodes.set(updated.id, updated);
    return updated;
  }

  // Supabase path — upsert by node_id.
  const { data: existing } = await supabase
    .from("nodes")
    .select("*")
    .eq("node_id", input.nodeId)
    .maybeSingle();

  const patch = {
    node_id: input.nodeId,
    label: input.label ?? existing?.label ?? input.nodeId,
    hostname: input.hostname ?? existing?.hostname ?? null,
    token_hash: input.tokenHash,
    pairing_code: input.pairingCode,
    pairing_expires_at: expiresAt,
    paired: false,
    owner_fingerprint: null,
    status: "offline" as const,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("nodes")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "announce update failed");
    return rowToNode(data);
  }

  const { data, error } = await supabase
    .from("nodes")
    .insert(patch)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "announce insert failed");
  return rowToNode(data);
}

// ---------------------------------------------------------------------------
// Claim a pairing code from the browser. Fingerprint = owner cookie.
// ---------------------------------------------------------------------------

export type PairResult =
  | { ok: true; node: PublicNodeRecord }
  | { ok: false; error: "not_found" | "expired" | "already_paired" };

export async function claimPairing(
  pairingCode: string,
  ownerFingerprint: string,
  label?: string,
): Promise<PairResult> {
  const code = pairingCode.trim().toUpperCase();
  const supabase = getServerSupabase();

  if (!supabase) {
    const match = [...memoryNodes.values()].find((n) => n.pairingCode === code);
    if (!match) return { ok: false, error: "not_found" };
    if (match.paired) return { ok: false, error: "already_paired" };
    if (
      match.pairingExpiresAt &&
      new Date(match.pairingExpiresAt).getTime() < Date.now()
    ) {
      return { ok: false, error: "expired" };
    }
    const claimed: NodeRecord = {
      ...match,
      paired: true,
      ownerFingerprint,
      pairingCode: null,
      pairingExpiresAt: null,
      label: label?.trim() || match.label,
    };
    memoryNodes.set(claimed.id, claimed);
    return { ok: true, node: toPublicNode(claimed) };
  }

  const { data: match } = await supabase
    .from("nodes")
    .select("*")
    .eq("pairing_code", code)
    .maybeSingle();
  if (!match) return { ok: false, error: "not_found" };
  if (match.paired) return { ok: false, error: "already_paired" };
  if (
    match.pairing_expires_at &&
    new Date(match.pairing_expires_at as string).getTime() < Date.now()
  ) {
    return { ok: false, error: "expired" };
  }

  const { data, error } = await supabase
    .from("nodes")
    .update({
      paired: true,
      owner_fingerprint: ownerFingerprint,
      pairing_code: null,
      pairing_expires_at: null,
      label: (label?.trim() || match.label) as string,
    })
    .eq("id", match.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "pair update failed");
  return { ok: true, node: toPublicNode(rowToNode(data)) };
}

// ---------------------------------------------------------------------------
// List all paired nodes for an owner.
// ---------------------------------------------------------------------------

/**
 * True iff the given owner cookie controls the given human-readable node id.
 * Used to gate `POST /api/v1/runs` with `mode=remote, nodeId=...`.
 */
export async function ownerOwnsNode(
  ownerFingerprint: string,
  nodeId: string,
): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return [...memoryNodes.values()].some(
      (n) =>
        n.paired &&
        n.ownerFingerprint === ownerFingerprint &&
        n.nodeId === nodeId,
    );
  }
  const { data } = await supabase
    .from("nodes")
    .select("id")
    .eq("owner_fingerprint", ownerFingerprint)
    .eq("node_id", nodeId)
    .eq("paired", true)
    .maybeSingle();
  return Boolean(data);
}

export async function listNodesForOwner(
  ownerFingerprint: string,
): Promise<PublicNodeRecord[]> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return [...memoryNodes.values()]
      .filter((n) => n.paired && n.ownerFingerprint === ownerFingerprint)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toPublicNode);
  }
  const { data } = await supabase
    .from("nodes")
    .select("*")
    .eq("owner_fingerprint", ownerFingerprint)
    .eq("paired", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => toPublicNode(rowToNode(r)));
}

// ---------------------------------------------------------------------------
// Unpair (delete the row — simpler than state machines for Phase 1).
// ---------------------------------------------------------------------------

export async function unpairNode(
  ownerFingerprint: string,
  nodeId: string,
): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) {
    for (const [k, v] of memoryNodes) {
      if (v.ownerFingerprint === ownerFingerprint && v.nodeId === nodeId) {
        memoryNodes.delete(k);
        return true;
      }
    }
    return false;
  }
  const { error, count } = await supabase
    .from("nodes")
    .delete({ count: "exact" })
    .eq("owner_fingerprint", ownerFingerprint)
    .eq("node_id", nodeId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Verify a Bearer token + node id. Returns the node record on success.
// ---------------------------------------------------------------------------

export type AuthedNode = NodeRecord;

export async function verifyBearerNode(
  headers: Headers,
): Promise<AuthedNode | null> {
  const authz = headers.get("authorization") ?? "";
  const nodeId = headers.get("x-umbrella-node-id");
  if (!authz.toLowerCase().startsWith("bearer ") || !nodeId) return null;
  const token = authz.slice(7).trim();
  if (!token) return null;
  const hash = sha256Hex(token);

  const supabase = getServerSupabase();
  if (!supabase) {
    const node = [...memoryNodes.values()].find(
      (n) => n.nodeId === nodeId && n.tokenHash === hash,
    );
    return node ?? null;
  }
  const { data } = await supabase
    .from("nodes")
    .select("*")
    .eq("node_id", nodeId)
    .eq("token_hash", hash)
    .maybeSingle();
  return data ? rowToNode(data) : null;
}

// ---------------------------------------------------------------------------
// Heartbeat: mark node online + update last_seen. Must be called by an
// already-verified node.
// ---------------------------------------------------------------------------

export async function recordHeartbeat(node: AuthedNode): Promise<NodeRecord> {
  const now = new Date().toISOString();
  const supabase = getServerSupabase();
  if (!supabase) {
    const updated: NodeRecord = {
      ...node,
      status: "online",
      lastSeenAt: now,
      lastHeartbeatAt: now,
    };
    memoryNodes.set(updated.id, updated);
    return updated;
  }
  const { data, error } = await supabase
    .from("nodes")
    .update({ status: "online", last_seen_at: now, last_heartbeat_at: now })
    .eq("id", node.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "heartbeat failed");
  return rowToNode(data);
}
