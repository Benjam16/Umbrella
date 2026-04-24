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
  curveAddress: Address | null;
  curveStage: "pending" | "deploying" | "active" | "graduated" | "failed";
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
const CURVE_BUY_EVENT = parseAbiItem(
  "event Buy(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 ethReserveAfter, uint256 tokensSoldAfter)",
);
const CURVE_SELL_EVENT = parseAbiItem(
  "event Sell(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 ethReserveAfter, uint256 tokensSoldAfter)",
);
const CURVE_GRADUATED_EVENT = parseAbiItem(
  "event Graduated(address indexed router, uint256 tokensSeeded, uint256 ethSeeded)",
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
      source?: "pool" | "curve";
    }> = [];

    for (const t of targets) {
      if (out.length >= perTickMaxTrades) break;

      // Bonding-curve prints while the curve is still active (pre-graduation).
      if (t.curveAddress && t.curveStage !== "graduated") {
        const curveEvents = await readCurveEvents(publicClient, {
          curveAddress: t.curveAddress,
          fromBlock,
          toBlock,
        });
        for (const p of curveEvents.trades) {
          if (out.length >= perTickMaxTrades) break;
          if (!p.blockNumber || !p.txHash) continue;
          const blockKey = p.blockNumber.toString();
          let ts = blockTsCache.get(blockKey);
          if (!ts) {
            const blk = await publicClient.getBlock({ blockNumber: p.blockNumber });
            ts = new Date(Number(blk.timestamp) * 1000).toISOString();
            blockTsCache.set(blockKey, ts);
          }
          const sizeUsd = Math.max(0.01, p.ethAmount * Math.max(1, t.priceUsd || 1));
          out.push({
            hookId: t.hookId,
            tokenAddress: t.tokenAddress,
            side: p.side,
            priceUsd: p.priceUsd || t.priceUsd,
            sizeUsd,
            chainId,
            logIndex: p.logIndex,
            idempotencyKey:
              p.txHash && p.logIndex !== undefined
                ? `${t.hookId}:${chainId}:${p.txHash.toLowerCase()}:${p.logIndex}:${p.side}:curve`
                : undefined,
            tradedAt: ts,
            txHash: p.txHash,
            blockNumber: Number(p.blockNumber),
            source: "curve",
          });
        }
        if (curveEvents.graduatedAt) {
          await markGraduated(baseUrl, t.hookId).catch(() => {});
        }
      }

      // Uniswap v4 pool prints (post-graduation), as before.
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
          source: "pool",
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
      curve?: {
        address?: string | null;
        stage?: string;
      } | null;
    }>;
  };
  const listings = data.listings ?? [];
  return listings
    .map((l) => {
      const token = l.token?.address?.toLowerCase();
      if (!token || !/^0x[a-f0-9]{40}$/.test(token)) return null;
      const poolCandidate =
        l.pool?.id?.toLowerCase() && /^0x[a-f0-9]{40}$/.test(l.pool.id.toLowerCase())
          ? l.pool.id.toLowerCase()
          : l.pool?.hookAddress?.toLowerCase();
      const poolAddress =
        poolCandidate && /^0x[a-f0-9]{40}$/.test(poolCandidate)
          ? (poolCandidate as Address)
          : ("0x0000000000000000000000000000000000000000" as Address);
      const curveAddress = l.curve?.address?.toLowerCase();
      const hasValidCurve = !!curveAddress && /^0x[a-f0-9]{40}$/.test(curveAddress);
      const stage = (l.curve?.stage ?? "pending") as Target["curveStage"];
      // Need either a real pool OR an active/graduating curve to be worth scanning.
      if (
        poolAddress === "0x0000000000000000000000000000000000000000" &&
        !hasValidCurve
      ) {
        return null;
      }
      return {
        hookId: l.id,
        tokenAddress: token as Address,
        poolAddress,
        curveAddress: hasValidCurve ? (curveAddress as Address) : null,
        curveStage: stage,
        decimals: l.token?.decimals ?? 18,
        priceUsd: Math.max(0.000001, l.price?.usd ?? 0.01),
      } as Target;
    })
    .filter((v): v is Target => !!v);
}

async function readCurveEvents(
  publicClient: any,
  args: { curveAddress: Address; fromBlock: bigint; toBlock: bigint },
): Promise<{
  trades: Array<{
    side: "buy" | "sell";
    txHash?: Hex;
    blockNumber?: bigint;
    logIndex?: number;
    ethAmount: number;
    tokenAmount: number;
    priceUsd: number;
  }>;
  graduatedAt: bigint | null;
}> {
  const [buys, sells, graduated] = await Promise.all([
    publicClient
      .getLogs({
        address: args.curveAddress,
        event: CURVE_BUY_EVENT,
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
      })
      .catch(() => []),
    publicClient
      .getLogs({
        address: args.curveAddress,
        event: CURVE_SELL_EVENT,
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
      })
      .catch(() => []),
    publicClient
      .getLogs({
        address: args.curveAddress,
        event: CURVE_GRADUATED_EVENT,
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
      })
      .catch(() => []),
  ]);

  const trades: Array<{
    side: "buy" | "sell";
    txHash?: Hex;
    blockNumber?: bigint;
    logIndex?: number;
    ethAmount: number;
    tokenAmount: number;
    priceUsd: number;
  }> = [];

  for (const l of buys as any[]) {
    const ethIn = BigInt(l.args.ethIn ?? 0n);
    const tokensOut = BigInt(l.args.tokensOut ?? 0n);
    if (ethIn === 0n || tokensOut === 0n) continue;
    const ethAmount = Number(formatUnits(ethIn, 18));
    const tokenAmount = Number(formatUnits(tokensOut, 18));
    trades.push({
      side: "buy",
      txHash: l.transactionHash ?? undefined,
      blockNumber: l.blockNumber ?? undefined,
      logIndex: l.logIndex ?? undefined,
      ethAmount,
      tokenAmount,
      priceUsd: tokenAmount > 0 ? ethAmount / tokenAmount : 0,
    });
  }
  for (const l of sells as any[]) {
    const tokensIn = BigInt(l.args.tokensIn ?? 0n);
    const ethOut = BigInt(l.args.ethOut ?? 0n);
    if (ethOut === 0n || tokensIn === 0n) continue;
    const ethAmount = Number(formatUnits(ethOut, 18));
    const tokenAmount = Number(formatUnits(tokensIn, 18));
    trades.push({
      side: "sell",
      txHash: l.transactionHash ?? undefined,
      blockNumber: l.blockNumber ?? undefined,
      logIndex: l.logIndex ?? undefined,
      ethAmount,
      tokenAmount,
      priceUsd: tokenAmount > 0 ? ethAmount / tokenAmount : 0,
    });
  }

  const graduatedAt =
    (graduated as any[]).length > 0
      ? ((graduated as any[])[0].blockNumber as bigint) ?? null
      : null;

  return { trades, graduatedAt };
}

async function markGraduated(baseUrl: string, hookId: string): Promise<void> {
  const secret = process.env.UMBRELLA_RELAYER_SECRET;
  if (!secret) return;
  try {
    await fetch(`${baseUrl}/api/v1/marketplace/curve-graduated`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ hookId }),
    });
  } catch {
    // best-effort; next tick will retry
  }
}

