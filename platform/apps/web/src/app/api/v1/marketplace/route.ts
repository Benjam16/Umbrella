import { countForksForMany, listPublicHooks } from "@/lib/forge-hooks";
import type { AgentListing } from "@/lib/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/marketplace
 *
 * Real data only: returns listings derived from `generated_hooks` where the
 * creator has flipped `is_public = true`. No seeded demo rows.
 *
 * On-chain performance metrics (price, revenue, missions) come online in a
 * later phase when the RelayerService + UmbrellaAgentToken indexer is live.
 * Until then the returned shape includes zeroed performance fields — the UI
 * already renders a blank state for those safely.
 */
export async function GET() {
  let broadcasts: AgentListing[] = [];
  try {
    const rows = await listPublicHooks(60);
    broadcasts = rows.map(toBroadcastListing);
    // One round-trip to fetch fork counts for the whole page, rather than
    // N queries from each card on the client.
    if (broadcasts.length > 0) {
      const counts = await countForksForMany(broadcasts.map((l) => l.id));
      for (const l of broadcasts) {
        l.forksCount = counts[l.id] ?? 0;
      }
    }
  } catch {
    broadcasts = [];
  }

  return Response.json(
    {
      listings: broadcasts,
      broadcastCount: broadcasts.length,
      updatedAt: Date.now(),
    },
    {
      headers: { "Cache-Control": "public, max-age=10, s-maxage=30" },
    },
  );
}

/**
 * Map a raw `generated_hooks` row into the `AgentListing` shape the UI
 * expects. On-chain metrics are zeroed; the indexer will populate them.
 */
function toBroadcastListing(row: {
  id: string;
  wallet_address: string;
  model: string;
  prompt: string | null;
  created_at: string;
}): AgentListing {
  const symbol = inferSymbol(row.prompt, row.id);
  const name = inferName(row.prompt, symbol);
  const createdAtMs = new Date(row.created_at).getTime();
  return {
    id: row.id,
    symbol,
    name,
    tagline: (row.prompt ?? "").slice(0, 120) || `${row.model} forged agent`,
    category: "research",
    blueprintId: "user-forged",
    identity: {
      chain: "base",
      contract: "0x0000000000000000000000000000000000000000",
      tokenId: row.id.slice(0, 8),
    },
    token: {
      chain: "base",
      address: `0x${row.id.replace(/-/g, "").slice(0, 40).padEnd(40, "0")}`,
      decimals: 18,
    },
    pool: {
      id: `0x${row.id.replace(/-/g, "").slice(0, 16)}`,
      hookAddress: "0x0000000000000000000000000000000000000000",
      tvlUsd: 0,
      volume24hUsd: 0,
    },
    price: { usd: 0, change24h: 0, change7d: 0, fdvUsd: 0 },
    performance: {
      missionsTotal: 0,
      missions24h: 0,
      successRate: 0,
      revenueAllTimeUsd: 0,
      revenue24hUsd: 0,
      burnedTokens: 0,
      dynamicFeeBps: 0,
      runwayHours: 0,
      active: false,
    },
    spark: [],
    missions: [],
    updatedAt: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
  };
}

function inferSymbol(prompt: string | null, id: string): string {
  if (!prompt) return id.slice(0, 4).toUpperCase();
  const match = prompt.match(/\b(?:Agent|Symbol|Ticker)\s*[:\-]\s*([A-Za-z0-9]{2,8})/i);
  if (match?.[1]) return match[1].toUpperCase().slice(0, 8);
  const word = prompt.match(/\b[A-Za-z]{3,8}\b/)?.[0];
  return (word ?? id.slice(0, 4)).toUpperCase().slice(0, 8);
}

function inferName(prompt: string | null, symbol: string): string {
  if (!prompt) return `Agent ${symbol}`;
  const match = prompt.match(/Agent:\s*([^()\n]{2,60})/i);
  if (match?.[1]) return match[1].trim();
  return `Agent ${symbol}`;
}
