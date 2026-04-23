import { z } from "zod";

export type NormalizedBlockchainWebhook = {
  provider: "generic" | "alchemy" | "coinbase";
  eventType: string;
  chainId?: number;
  walletAddress?: string;
  txHash?: string;
  userId?: string;
  userEmail?: string;
  objective?: string;
  maxCredits?: number;
  payload?: Record<string, unknown>;
  /**
   * Optional normalized market prints for hook-token telemetry ingestion.
   * Expected to be supplied by indexer-style providers in generic payloads.
   */
  marketTrades?: Array<{
    hookId: string;
    side: "buy" | "sell";
    priceUsd: number;
    sizeUsd: number;
    tradedAt?: string;
    txHash?: string;
    blockNumber?: number;
  }>;
};

const genericSchema = z.object({
  eventType: z.string().min(1).max(80),
  chainId: z.number().int().positive().optional(),
  walletAddress: z.string().min(6).max(120).optional(),
  txHash: z.string().min(6).max(180).optional(),
  userId: z.string().min(6).max(120).optional(),
  userEmail: z.string().email().optional(),
  objective: z.string().min(8).max(20_000).optional(),
  maxCredits: z.number().int().positive().max(100_000).optional(),
  payload: z.record(z.unknown()).optional(),
  trades: z
    .array(
      z.object({
        hookId: z.string().uuid(),
        side: z.enum(["buy", "sell"]),
        priceUsd: z.number().positive(),
        sizeUsd: z.number().positive(),
        tradedAt: z.string().datetime().optional(),
        txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
        blockNumber: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
});

const alchemySchema = z.object({
  webhookId: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  type: z.string().min(1),
  event: z
    .object({
      network: z.string().optional(),
      activity: z
        .array(
          z.object({
            hash: z.string().optional(),
            fromAddress: z.string().optional(),
            toAddress: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  metadata: z
    .object({
      userId: z.string().optional(),
      userEmail: z.string().optional(),
      objective: z.string().optional(),
      maxCredits: z.number().optional(),
    })
    .optional(),
});

const coinbaseSchema = z.object({
  event: z.object({
    type: z.string().min(1),
    txHash: z.string().optional(),
    walletAddress: z.string().optional(),
    network: z.string().optional(),
  }),
  data: z.record(z.unknown()).optional(),
  metadata: z
    .object({
      userId: z.string().optional(),
      userEmail: z.string().optional(),
      objective: z.string().optional(),
      maxCredits: z.number().optional(),
    })
    .optional(),
});

function networkToChainId(network?: string): number | undefined {
  const n = (network || "").toLowerCase();
  if (n.includes("base")) return 8453;
  if (n.includes("ethereum") || n === "mainnet") return 1;
  if (n.includes("sepolia")) return 11155111;
  return undefined;
}

export function normalizeBlockchainWebhook(input: unknown): NormalizedBlockchainWebhook | null {
  const generic = genericSchema.safeParse(input);
  if (generic.success) {
    return {
      provider: "generic",
      ...generic.data,
      marketTrades: generic.data.trades,
    };
  }

  const alchemy = alchemySchema.safeParse(input);
  if (alchemy.success) {
    const first = alchemy.data.event?.activity?.[0];
    return {
      provider: "alchemy",
      eventType: alchemy.data.type,
      chainId: networkToChainId(alchemy.data.event?.network),
      walletAddress: first?.toAddress || first?.fromAddress,
      txHash: first?.hash,
      userId: alchemy.data.metadata?.userId,
      userEmail: alchemy.data.metadata?.userEmail,
      objective: alchemy.data.metadata?.objective,
      maxCredits: alchemy.data.metadata?.maxCredits,
      payload: alchemy.data as unknown as Record<string, unknown>,
    };
  }

  const coinbase = coinbaseSchema.safeParse(input);
  if (coinbase.success) {
    return {
      provider: "coinbase",
      eventType: coinbase.data.event.type,
      chainId: networkToChainId(coinbase.data.event.network),
      walletAddress: coinbase.data.event.walletAddress,
      txHash: coinbase.data.event.txHash,
      userId: coinbase.data.metadata?.userId,
      userEmail: coinbase.data.metadata?.userEmail,
      objective: coinbase.data.metadata?.objective,
      maxCredits: coinbase.data.metadata?.maxCredits,
      payload: coinbase.data.data,
    };
  }

  return null;
}
