import { countForksForMany, listPublicHooks } from "@/lib/forge-hooks";
import { defaultLaunchChainId, getLaunchConfig } from "@/lib/launch/chain-config";
import type { AgentListing } from "@/lib/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/marketplace
 *
 * Real data only: returns listings derived from `generated_hooks` where the
 * creator has flipped `is_public = true`. Rows without a canonical
 * `token_address` are filtered out so the marketplace never routes traders
 * to a fake address.
 *
 * Each row includes the pump.fun-style curve metadata (stage, progress,
 * graduation threshold) populated by the launch orchestrator + indexer.
 */
export async function GET() {
  let listings: AgentListing[] = [];
  let graduationThresholdWei = "0";
  try {
    graduationThresholdWei = getLaunchConfig(defaultLaunchChainId()).graduationThresholdWei.toString();
  } catch {
    graduationThresholdWei = "0";
  }

  try {
    const rows = await listPublicHooks(60);
    listings = rows
      .filter((row) => /^0x[a-fA-F0-9]{40}$/.test(row.token_address ?? ""))
      .map((row) => toListing(row, graduationThresholdWei));
    if (listings.length > 0) {
      const counts = await countForksForMany(listings.map((l) => l.id));
      for (const l of listings) {
        l.forksCount = counts[l.id] ?? 0;
      }
    }
  } catch {
    listings = [];
  }

  return Response.json(
    {
      listings,
      broadcastCount: listings.length,
      updatedAt: Date.now(),
    },
    {
      headers: { "Cache-Control": "public, max-age=10, s-maxage=30" },
    },
  );
}

type RowWithCurve = {
  id: string;
  wallet_address: string;
  model: string;
  prompt: string | null;
  created_at: string;
  token_address: string | null;
  pool_address: string | null;
  hook_address: string | null;
  chain_id?: number | null;
  curve_address?: string | null;
  curve_stage?: string | null;
  verified_at?: string | null;
  deploy_error?: string | null;
};

function toListing(row: RowWithCurve, thresholdWei: string): AgentListing {
  const symbol = inferSymbol(row.prompt, row.id);
  const name = inferName(row.prompt, symbol);
  const createdAtMs = new Date(row.created_at).getTime();
  const stage = normalizeStage(row.curve_stage);

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
      address: row.token_address!,
      decimals: 18,
    },
    pool: {
      id:
        row.pool_address && /^0x[a-fA-F0-9]{16,64}$/.test(row.pool_address)
          ? row.pool_address
          : "0x0000000000000000000000000000000000000000",
      hookAddress:
        row.hook_address && /^0x[a-fA-F0-9]{40}$/.test(row.hook_address)
          ? row.hook_address
          : "0x0000000000000000000000000000000000000000",
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
      active: stage === "active",
    },
    spark: [],
    missions: [],
    updatedAt: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    curve: {
      address: row.curve_address ?? null,
      chainId: row.chain_id ?? null,
      stage,
      ethReserveWei: "0",
      graduationThresholdWei: thresholdWei,
      progress: 0,
      deployError: row.deploy_error ?? null,
      verifiedAt: row.verified_at ?? null,
    },
  };
}

function normalizeStage(
  stage: string | null | undefined,
): "pending" | "deploying" | "active" | "graduated" | "failed" {
  if (stage === "deploying" || stage === "active" || stage === "graduated" || stage === "failed") {
    return stage;
  }
  return "pending";
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
