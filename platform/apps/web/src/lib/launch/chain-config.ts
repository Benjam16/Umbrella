import { base, baseSepolia } from "viem/chains";
import type { Chain } from "viem";

/**
 * Per-chain configuration for the launch pipeline.
 *
 * On Base Sepolia (the default target during rollout) every address resolves
 * from the `*_SEPOLIA` env variables below. Base mainnet is gated behind the
 * `UMBRELLA_LAUNCH_MAINNET_ENABLED` flag so accidental deploys can't happen.
 *
 * Callers should always go through {@link getLaunchConfig} so env validation
 * happens in one place.
 */
export type LaunchConfig = {
  chainId: number;
  chain: Chain;
  rpcUrl: string;
  rpcCandidates: string[];
  agentTokenFactory: `0x${string}`;
  curveFactory: `0x${string}`;
  v4Router: `0x${string}`;
  treasury: `0x${string}`;
  launchFeeWei: bigint;
  graduationThresholdWei: bigint;
  explorerTxUrl: (tx: string) => string;
  explorerAddressUrl: (addr: string) => string;
};

export class LaunchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchConfigError";
  }
}

function pickAddress(name: string, value: string | undefined): `0x${string}` {
  const v = value?.trim();
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) {
    throw new LaunchConfigError(`${name} is not set to a valid 0x address`);
  }
  return v.toLowerCase() as `0x${string}`;
}

function pickBigInt(name: string, value: string | undefined, fallback?: bigint): bigint {
  const v = value?.trim();
  if (!v) {
    if (fallback !== undefined) return fallback;
    throw new LaunchConfigError(`${name} is not set`);
  }
  try {
    return BigInt(v);
  } catch {
    throw new LaunchConfigError(`${name} must be a numeric string, got: ${v}`);
  }
}

/**
 * Returns true if an RPC URL is obviously unconfigured (still contains a
 * `<placeholder>` token or the literal string "your-"). Many Vercel deploys
 * leave Alchemy URLs like `https://base-sepolia.g.alchemy.com/v2/<your-key>`
 * in env vars — we must treat those as "not set" so we don't hammer a broken
 * endpoint and throw confusing JSON-parse errors.
 */
function isPlaceholderRpcUrl(url: string): boolean {
  const v = url.trim();
  if (!v) return true;
  if (/[<>]/.test(v)) return true;
  if (/%3c|%3e/i.test(v)) return true;
  if (/your[-_](?:alchemy[-_])?(?:api[-_])?key/i.test(v)) return true;
  if (/\/(?:YOUR_|REPLACE_|PLACEHOLDER)/i.test(v)) return true;
  try {
    new URL(v);
  } catch {
    return true;
  }
  return false;
}

function buildRpcCandidates(primary: string | undefined, publicFallback: string): string[] {
  const raw = [primary?.trim() ?? "", process.env.BASE_RPC_URL?.trim() ?? "", publicFallback];
  const out = raw
    .map((s) => s?.trim() ?? "")
    .filter((s) => s.length > 0 && !isPlaceholderRpcUrl(s));
  const deduped = out.filter((s, idx, arr) => arr.indexOf(s) === idx);
  if (deduped.length === 0) deduped.push(publicFallback);
  return deduped;
}

export function defaultLaunchChainId(): number {
  return Number(process.env.UMBRELLA_FORGE_CHAIN_ID?.trim() ?? "84532");
}

export function getLaunchConfig(chainId?: number): LaunchConfig {
  const targetChainId = chainId ?? defaultLaunchChainId();
  const mainnetEnabled =
    (process.env.UMBRELLA_LAUNCH_MAINNET_ENABLED?.trim() ?? "false").toLowerCase() === "true";

  if (targetChainId === 84532) {
    const rpcCandidates = buildRpcCandidates(
      process.env.BASE_SEPOLIA_RPC_URL,
      "https://sepolia.base.org",
    );
    return {
      chainId: 84532,
      chain: baseSepolia,
      rpcUrl: rpcCandidates[0] ?? "https://sepolia.base.org",
      rpcCandidates,
      agentTokenFactory: pickAddress(
        "UMBRELLA_AGENT_TOKEN_FACTORY_SEPOLIA",
        process.env.UMBRELLA_AGENT_TOKEN_FACTORY_SEPOLIA,
      ),
      curveFactory: pickAddress(
        "UMBRELLA_CURVE_FACTORY_SEPOLIA",
        process.env.UMBRELLA_CURVE_FACTORY_SEPOLIA,
      ),
      v4Router: pickAddress(
        "UMBRELLA_V4_ROUTER_SEPOLIA",
        process.env.UMBRELLA_V4_ROUTER_SEPOLIA ?? process.env.UMBRELLA_V4_ROUTER,
      ),
      treasury: pickAddress(
        "TREASURY_ADDRESS_SEPOLIA",
        process.env.TREASURY_ADDRESS_SEPOLIA ?? process.env.TREASURY_ADDRESS,
      ),
      launchFeeWei: pickBigInt(
        "UMBRELLA_FORGE_MIN_PAYMENT_WEI_SEPOLIA",
        process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI_SEPOLIA,
        1_100_000_000_000_000n,
      ),
      graduationThresholdWei: pickBigInt(
        "UMBRELLA_GRADUATION_THRESHOLD_WEI",
        process.env.UMBRELLA_GRADUATION_THRESHOLD_WEI,
        5_000_000_000_000_000_000n,
      ),
      explorerTxUrl: (tx) => `https://sepolia.basescan.org/tx/${tx}`,
      explorerAddressUrl: (addr) => `https://sepolia.basescan.org/address/${addr}`,
    };
  }

  if (targetChainId === 8453) {
    if (!mainnetEnabled) {
      throw new LaunchConfigError(
        "Base mainnet launches are disabled. Set UMBRELLA_LAUNCH_MAINNET_ENABLED=true to enable.",
      );
    }
    const rpcCandidates = buildRpcCandidates(process.env.BASE_RPC_URL, "https://mainnet.base.org");
    return {
      chainId: 8453,
      chain: base,
      rpcUrl: rpcCandidates[0] ?? "https://mainnet.base.org",
      rpcCandidates,
      agentTokenFactory: pickAddress(
        "UMBRELLA_AGENT_TOKEN_FACTORY_BASE",
        process.env.UMBRELLA_AGENT_TOKEN_FACTORY_BASE,
      ),
      curveFactory: pickAddress(
        "UMBRELLA_CURVE_FACTORY_BASE",
        process.env.UMBRELLA_CURVE_FACTORY_BASE,
      ),
      v4Router: pickAddress(
        "UMBRELLA_V4_ROUTER_BASE",
        process.env.UMBRELLA_V4_ROUTER_BASE ?? process.env.UMBRELLA_V4_ROUTER,
      ),
      treasury: pickAddress("TREASURY_ADDRESS", process.env.TREASURY_ADDRESS),
      launchFeeWei: pickBigInt(
        "UMBRELLA_FORGE_MIN_PAYMENT_WEI",
        process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI,
        1_100_000_000_000_000n,
      ),
      graduationThresholdWei: pickBigInt(
        "UMBRELLA_GRADUATION_THRESHOLD_WEI",
        process.env.UMBRELLA_GRADUATION_THRESHOLD_WEI,
        5_000_000_000_000_000_000n,
      ),
      explorerTxUrl: (tx) => `https://basescan.org/tx/${tx}`,
      explorerAddressUrl: (addr) => `https://basescan.org/address/${addr}`,
    };
  }

  throw new LaunchConfigError(`unsupported launch chain ${targetChainId}`);
}
