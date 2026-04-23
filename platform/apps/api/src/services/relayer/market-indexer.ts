import {
  createPublicClient,
  formatUnits,
  http,
  parseAbiItem,
  type Address,
  type Hex,
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
const SWAP_V2_EVENT = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);
const SWAP_V3_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);
const TOKEN0_FN = parseAbiItem("function token0() view returns (address)");
const TOKEN1_FN = parseAbiItem("function token1() view returns (address)");

export function createMarketSwapIndexer(
  client: WebClient,
  opts: { chainId?: number } = {},
): MarketIndexer {
  const baseUrl =
    process.env.UMBRELLA_WEB_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:3040";
  const chainId = Number(opts.chainId ?? process.env.UMBRELLA_MARKET_CHAIN_ID ?? 8453);
  const chain = chainId === 84532 ? baseSepolia : base;
  const rpc =
    chainId === 84532
      ? process.env.BASE_SEPOLIA_RPC_URL ?? process.env.BASE_RPC_URL
      : process.env.BASE_RPC_URL;
  const lookback = BigInt(Math.max(30, Number(process.env.UMBRELLA_MARKET_LOOKBACK_BLOCKS ?? 400)));
  const perTickMaxTrades = Math.max(10, Number(process.env.UMBRELLA_MARKET_MAX_TRADES_PER_TICK ?? 250));
  const cursorId = `market-swap-indexer:${chainId}`;

  if (!rpc) {
    return { tick: async () => ({ scannedTargets: 0, emittedTrades: 0 }) };
  }
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const tokenSideCache = new Map<string, 0 | 1 | null>();

  async function tick(): Promise<{ scannedTargets: number; emittedTrades: number }> {
    const targets = await fetchTargets(baseUrl);
    if (targets.length === 0) return { scannedTargets: 0, emittedTrades: 0 };

    const latest = await publicClient.getBlockNumber();
    const cursor = await client.getIndexerCursor(cursorId).catch(() => ({
      cursorBlock: 0n,
      meta: {},
    }));
    const fromBlock =
      cursor.cursorBlock > 0n && cursor.cursorBlock < latest
        ? cursor.cursorBlock + 1n
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
      chainId?: number;
      logIndex?: number;
      idempotencyKey?: string;
      tradedAt: string;
      txHash?: string;
      blockNumber?: number;
    }> = [];

    for (const t of targets) {
      if (out.length >= perTickMaxTrades) break;
      const tokenSide = await resolvePoolTokenIndex(
        publicClient,
        tokenSideCache,
        t.poolAddress,
        t.tokenAddress,
      );
      const swaps = await readPoolSwapEvents(publicClient, {
        ...t,
        tokenSide,
        fromBlock,
        toBlock,
      });
      const fallback =
        swaps.length > 0
          ? []
          : await readTransferFallback(publicClient, t, fromBlock, toBlock);
      const merged = [...swaps, ...fallback].sort((a, b) =>
        Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)),
      );

      for (const p of merged) {
        if (out.length >= perTickMaxTrades) break;
        if (!p.blockNumber || !p.txHash || !p.sizeToken || p.sizeToken <= 0) continue;
        const blockKey = p.blockNumber.toString();
        let ts = blockTsCache.get(blockKey);
        if (!ts) {
          const blk = await publicClient.getBlock({ blockNumber: p.blockNumber });
          ts = new Date(Number(blk.timestamp) * 1000).toISOString();
          blockTsCache.set(blockKey, ts);
        }
        const sizeUsd = Math.max(0.01, p.sizeToken * Math.max(0.000001, t.priceUsd));
        out.push({
          hookId: t.hookId,
          tokenAddress: t.tokenAddress,
          side: p.side,
          priceUsd: t.priceUsd,
          sizeUsd,
          chainId,
          logIndex: p.logIndex,
          idempotencyKey:
            p.txHash && p.logIndex !== undefined
              ? `${t.hookId}:${chainId}:${p.txHash.toLowerCase()}:${p.logIndex}:${p.side}`
              : undefined,
          tradedAt: ts,
          txHash: p.txHash,
          blockNumber: Number(p.blockNumber),
        });
      }
    }

    if (out.length > 0) {
      const res = await client.postMarketTrades(out);
      await client.setIndexerCursor(cursorId, toBlock, {
        chainId,
        targets: targets.length,
        emittedTrades: res.insertedTrades ?? out.length,
        updatedAt: new Date().toISOString(),
      });
      return {
        scannedTargets: targets.length,
        emittedTrades: res.insertedTrades ?? out.length,
      };
    }

    await client.setIndexerCursor(cursorId, toBlock, {
      chainId,
      targets: targets.length,
      emittedTrades: 0,
      updatedAt: new Date().toISOString(),
    });
    return { scannedTargets: targets.length, emittedTrades: 0 };
  }

  return { tick };
}

async function resolvePoolTokenIndex(
  publicClient: any,
  cache: Map<string, 0 | 1 | null>,
  poolAddress: Address,
  tokenAddress: Address,
): Promise<0 | 1 | null> {
  const key = `${poolAddress}:${tokenAddress}`.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  try {
    const [token0, token1] = await Promise.all([
      publicClient.readContract({
        address: poolAddress,
        abi: [TOKEN0_FN],
        functionName: "token0",
      }),
      publicClient.readContract({
        address: poolAddress,
        abi: [TOKEN1_FN],
        functionName: "token1",
      }),
    ]);
    const t0 = (token0 as string).toLowerCase();
    const t1 = (token1 as string).toLowerCase();
    const tok = tokenAddress.toLowerCase();
    const idx = tok === t0 ? 0 : tok === t1 ? 1 : null;
    cache.set(key, idx);
    return idx;
  } catch {
    cache.set(key, null);
    return null;
  }
}

async function readPoolSwapEvents(
  publicClient: any,
  args: Target & { tokenSide: 0 | 1 | null; fromBlock: bigint; toBlock: bigint },
) {
  if (args.tokenSide === null) return [];
  const out: Array<{
    side: "buy" | "sell";
    txHash?: Hex;
    blockNumber?: bigint;
    logIndex?: number;
    sizeToken?: number;
  }> = [];

  const [v2, v3] = await Promise.all([
    publicClient
      .getLogs({
        address: args.poolAddress,
        event: SWAP_V2_EVENT,
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
      })
      .catch(() => []),
    publicClient
      .getLogs({
        address: args.poolAddress,
        event: SWAP_V3_EVENT,
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
      })
      .catch(() => []),
  ]);

  for (const l of v2) {
    const tokenIn =
      args.tokenSide === 0 ? Number(l.args.amount0In ?? 0n) : Number(l.args.amount1In ?? 0n);
    const tokenOut =
      args.tokenSide === 0 ? Number(l.args.amount0Out ?? 0n) : Number(l.args.amount1Out ?? 0n);
    if (tokenIn <= 0 && tokenOut <= 0) continue;
    const side: "buy" | "sell" = tokenOut > tokenIn ? "buy" : "sell";
    const raw = tokenOut > 0 ? tokenOut : tokenIn;
    const sizeToken = Number(formatUnits(BigInt(Math.trunc(raw)), args.decimals));
    out.push({
      side,
      txHash: l.transactionHash ?? undefined,
      blockNumber: l.blockNumber ?? undefined,
      logIndex: l.logIndex ?? undefined,
      sizeToken,
    });
  }

  for (const l of v3) {
    const a0 = l.args.amount0 ?? 0n;
    const a1 = l.args.amount1 ?? 0n;
    const tracked = args.tokenSide === 0 ? a0 : a1;
    if (tracked === 0n) continue;
    const side: "buy" | "sell" = tracked < 0n ? "buy" : "sell";
    const magnitude = tracked < 0n ? -tracked : tracked;
    const sizeToken = Number(formatUnits(magnitude, args.decimals));
    out.push({
      side,
      txHash: l.transactionHash ?? undefined,
      blockNumber: l.blockNumber ?? undefined,
      logIndex: l.logIndex ?? undefined,
      sizeToken,
    });
  }

  return out;
}

async function readTransferFallback(
  publicClient: any,
  t: Target,
  fromBlock: bigint,
  toBlock: bigint,
) {
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
  return [
    ...mapTransferLogs(buyLogs, "buy", t.decimals),
    ...mapTransferLogs(sellLogs, "sell", t.decimals),
  ];
}

function mapTransferLogs(
  logs: Array<{
    transactionHash: `0x${string}` | null;
    blockNumber: bigint | null;
    args: { value?: bigint };
  }>,
  side: "buy" | "sell",
  decimals: number,
) {
  return logs.map((l) => ({
    side,
    txHash: l.transactionHash ?? undefined,
    blockNumber: l.blockNumber ?? undefined,
    logIndex: (l as { logIndex?: number | null }).logIndex ?? undefined,
    sizeToken: Number(formatUnits(l.args.value ?? 0n, decimals)),
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

