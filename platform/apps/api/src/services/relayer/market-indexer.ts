import {
  createPublicClient,
  formatUnits,
  http,
  parseAbiItem,
  type Address,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import type { WebClient } from "./client.js";

type MarketIndexer = {
  tick: () => Promise<{ scannedTargets: number; emittedTrades: number }>;
};

type Target = {
  hookId: string;
  tokenAddress: Address;
  poolAddress: Address;
  decimals: number;
  priceUsd: number;
};

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export function createMarketSwapIndexer(client: WebClient): MarketIndexer {
  const baseUrl =
    process.env.UMBRELLA_WEB_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:3040";
  const chainId = Number(process.env.UMBRELLA_MARKET_CHAIN_ID ?? 8453);
  const chain = chainId === 84532 ? baseSepolia : base;
  const rpc =
    chainId === 84532
      ? process.env.BASE_SEPOLIA_RPC_URL ?? process.env.BASE_RPC_URL
      : process.env.BASE_RPC_URL;
  const lookback = BigInt(Math.max(30, Number(process.env.UMBRELLA_MARKET_LOOKBACK_BLOCKS ?? 400)));
  const perTickMaxTrades = Math.max(10, Number(process.env.UMBRELLA_MARKET_MAX_TRADES_PER_TICK ?? 250));

  if (!rpc) {
    return {
      tick: async () => ({ scannedTargets: 0, emittedTrades: 0 }),
    };
  }
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  let lastIndexedBlock: bigint | null = null;

  async function tick(): Promise<{ scannedTargets: number; emittedTrades: number }> {
    const targets = await fetchTargets(baseUrl);
    if (targets.length === 0) return { scannedTargets: 0, emittedTrades: 0 };

    const latest = await publicClient.getBlockNumber();
    const fromBlock =
      lastIndexedBlock && lastIndexedBlock < latest
        ? lastIndexedBlock + 1n
        : latest > lookback
          ? latest - lookback
          : 0n;
    const toBlock = latest;
    if (fromBlock > toBlock) return { scannedTargets: targets.length, emittedTrades: 0 };

    const blockTsCache = new Map<string, string>();
    const out: Array<{
      hookId: string;
      tokenAddress: string;
      side: "buy" | "sell";
      priceUsd: number;
      sizeUsd: number;
      tradedAt: string;
      txHash?: string;
      blockNumber?: number;
    }> = [];

    for (const t of targets) {
      if (out.length >= perTickMaxTrades) break;
      const [buyLogs, sellLogs] = await Promise.all([
        publicClient.getLogs({
          address: t.tokenAddress,
          event: TRANSFER_EVENT,
          args: { from: t.poolAddress },
          fromBlock,
          toBlock,
        }),
        publicClient.getLogs({
          address: t.tokenAddress,
          event: TRANSFER_EVENT,
          args: { to: t.poolAddress },
          fromBlock,
          toBlock,
        }),
      ]);
      const parsed = [...mapLogs(buyLogs, "buy"), ...mapLogs(sellLogs, "sell")];
      for (const p of parsed) {
        if (out.length >= perTickMaxTrades) break;
        if (!p.blockNumber) continue;
        const blockKey = p.blockNumber.toString();
        let ts = blockTsCache.get(blockKey);
        if (!ts) {
          const blk = await publicClient.getBlock({ blockNumber: p.blockNumber });
          ts = new Date(Number(blk.timestamp) * 1000).toISOString();
          blockTsCache.set(blockKey, ts);
        }
        const tokenAmount = parseFloat(formatUnits(p.value, t.decimals));
        const sizeUsd = Math.max(0.01, tokenAmount * Math.max(0.000001, t.priceUsd));
        out.push({
          hookId: t.hookId,
          tokenAddress: t.tokenAddress,
          side: p.side,
          priceUsd: t.priceUsd,
          sizeUsd,
          tradedAt: ts,
          txHash: p.txHash,
          blockNumber: Number(p.blockNumber),
        });
      }
    }

    lastIndexedBlock = toBlock;
    if (out.length === 0) return { scannedTargets: targets.length, emittedTrades: 0 };
    const res = await client.postMarketTrades(out);
    return { scannedTargets: targets.length, emittedTrades: res.insertedTrades ?? out.length };
  }

  return { tick };
}

function mapLogs(
  logs: Array<{
    transactionHash: `0x${string}` | null;
    blockNumber: bigint | null;
    args: { value?: bigint };
  }>,
  side: "buy" | "sell",
) {
  return logs.map((l) => ({
    side,
    txHash: l.transactionHash ?? undefined,
    blockNumber: l.blockNumber ?? undefined,
    value: l.args.value ?? 0n,
  }));
}

async function fetchTargets(baseUrl: string): Promise<Target[]> {
  const res = await fetch(`${baseUrl}/api/v1/marketplace`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    listings?: Array<{
      id: string;
      token?: { address?: string; decimals?: number };
      pool?: { id?: string; hookAddress?: string };
      price?: { usd?: number };
    }>;
  };
  const listings = data.listings ?? [];
  return listings
    .map((l) => {
      const token = l.token?.address?.toLowerCase();
      const poolCandidate =
        l.pool?.id?.toLowerCase() && /^0x[a-f0-9]{40}$/.test(l.pool.id.toLowerCase())
          ? l.pool.id.toLowerCase()
          : l.pool?.hookAddress?.toLowerCase();
      if (!token || !/^0x[a-f0-9]{40}$/.test(token)) return null;
      if (!poolCandidate || !/^0x[a-f0-9]{40}$/.test(poolCandidate)) return null;
      return {
        hookId: l.id,
        tokenAddress: token as Address,
        poolAddress: poolCandidate as Address,
        decimals: l.token?.decimals ?? 18,
        priceUsd: Math.max(0.000001, l.price?.usd ?? 0.01),
      } as Target;
    })
    .filter((v): v is Target => !!v);
}

