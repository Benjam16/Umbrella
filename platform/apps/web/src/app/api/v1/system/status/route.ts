import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { getServerSupabase, isSupabaseConfigured } from "@umbrella/runner/supabase";
import { readWalletSessionFromCookie } from "@/lib/wallet-session";
import { defaultLaunchChainId, getLaunchConfig } from "@/lib/launch/chain-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChainDiag = {
  chainId: number;
  rpcConfigured: boolean;
  latestBlock: number | null;
  cursorId: string;
  cursorBlock: number | null;
  cursorUpdatedAt: string | null;
  lagBlocks: number | null;
  error?: string;
};

export async function GET(req: Request) {
  const forgeChainId = Number(process.env.UMBRELLA_FORGE_CHAIN_ID?.trim() ?? "84532");
  const isForgeSepolia = forgeChainId === 84532;
  const forgeTreasury =
    (isForgeSepolia ? process.env.TREASURY_ADDRESS_SEPOLIA : undefined) ??
    process.env.TREASURY_ADDRESS ??
    "";
  const forgeMinWei = (
    (isForgeSepolia ? process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI_SEPOLIA : undefined) ??
    process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI ??
    ""
  ).trim();

  const wallet = readWalletSessionFromCookie(req.headers.get("cookie"));
  const supabase = getServerSupabase();
  const supabaseConfigured = isSupabaseConfigured();
  const supabaseReachable = await checkSupabaseReachable(supabase);

  const marketChainIds = parseChainIds(
    process.env.UMBRELLA_MARKET_CHAIN_IDS,
    Number(process.env.UMBRELLA_MARKET_CHAIN_ID ?? 8453),
  );
  const indexers = await Promise.all(marketChainIds.map((id) => buildChainDiag(id, supabase)));
  const deployer = await readDeployerDiag();

  return Response.json(
    {
      now: new Date().toISOString(),
      walletSession: {
        hasSession: Boolean(wallet),
        wallet: wallet ?? null,
      },
      forge: {
        chainId: forgeChainId,
        treasuryAddress: /^0x[a-fA-F0-9]{40}$/.test(forgeTreasury) ? forgeTreasury : null,
        minPaymentWei: /^\d+$/.test(forgeMinWei) ? forgeMinWei : null,
        kimiConfigured: Boolean(process.env.KIMI_API_KEY?.trim()),
      },
      supabase: {
        configured: supabaseConfigured,
        reachable: supabaseReachable,
      },
      relayer: {
        relayerSecretConfigured: Boolean(process.env.UMBRELLA_RELAYER_SECRET?.trim()),
      },
      deployer,
      marketIndexer: {
        chainIds: marketChainIds,
        chains: indexers,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function readDeployerDiag(): Promise<{
  configured: boolean;
  address: string | null;
  chainId: number | null;
  balanceEth: string | null;
  lowBalance: boolean;
  basescanKeyConfigured: boolean;
  error: string | null;
}> {
  const key = process.env.UMBRELLA_DEPLOYER_PRIVATE_KEY?.trim();
  const basescanKeyConfigured = Boolean(process.env.BASESCAN_API_KEY?.trim());
  if (!key) {
    return {
      configured: false,
      address: null,
      chainId: null,
      balanceEth: null,
      lowBalance: false,
      basescanKeyConfigured,
      error: null,
    };
  }
  try {
    const normalized = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
    const account = privateKeyToAccount(normalized);
    const chainId = defaultLaunchChainId();
    const cfg = getLaunchConfig(chainId);
    const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
    const balance = await client.getBalance({ address: account.address });
    const balanceEth = formatEther(balance);
    const lowBalance = balance < 10_000_000_000_000_000n; // below 0.01 ETH
    return {
      configured: true,
      address: account.address,
      chainId: cfg.chainId,
      balanceEth,
      lowBalance,
      basescanKeyConfigured,
      error: null,
    };
  } catch (err) {
    return {
      configured: true,
      address: null,
      chainId: null,
      balanceEth: null,
      lowBalance: false,
      basescanKeyConfigured,
      error: err instanceof Error ? err.message : "deployer diag failed",
    };
  }
}

function parseChainIds(raw: string | undefined, fallback: number): number[] {
  if (!raw?.trim()) return [fallback];
  const ids = raw
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? Array.from(new Set(ids)) : [fallback];
}

async function checkSupabaseReachable(
  supabase: ReturnType<typeof getServerSupabase>,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("generated_hooks").select("id").limit(1);
  return !error;
}

async function buildChainDiag(
  chainId: number,
  supabase: ReturnType<typeof getServerSupabase>,
): Promise<ChainDiag> {
  const cursorId = `market-swap-indexer:${chainId}`;
  const rpcUrl =
    chainId === 84532
      ? process.env.BASE_SEPOLIA_RPC_URL?.trim() || process.env.BASE_RPC_URL?.trim() || ""
      : chainId === 8453
        ? process.env.BASE_RPC_URL?.trim() || ""
        : "";

  let latestBlock: number | null = null;
  let rpcError: string | undefined;
  if (rpcUrl) {
    try {
      const chain = chainId === 84532 ? baseSepolia : base;
      const client = createPublicClient({ chain, transport: http(rpcUrl) });
      latestBlock = Number(await client.getBlockNumber());
    } catch (err) {
      rpcError = err instanceof Error ? err.message : "rpc error";
    }
  }

  let cursorBlock: number | null = null;
  let cursorUpdatedAt: string | null = null;
  let dbError: string | undefined;
  if (supabase) {
    const { data, error } = await supabase
      .from("market_indexer_state")
      .select("cursor_block, updated_at")
      .eq("id", cursorId)
      .maybeSingle();
    if (error) {
      dbError = error.message;
    } else if (data) {
      cursorBlock = Number(data.cursor_block);
      cursorUpdatedAt = data.updated_at as string;
    }
  }

  const lagBlocks =
    latestBlock !== null && cursorBlock !== null ? Math.max(0, latestBlock - cursorBlock) : null;

  return {
    chainId,
    rpcConfigured: Boolean(rpcUrl),
    latestBlock,
    cursorId,
    cursorBlock,
    cursorUpdatedAt,
    lagBlocks,
    error: rpcError ?? dbError,
  };
}

