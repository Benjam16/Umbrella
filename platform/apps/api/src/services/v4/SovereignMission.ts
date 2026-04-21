import { encodeFunctionData, encodePacked, keccak256, type Address, type Hex } from "viem";

import { launchSwarm, type SwarmLaunchResult } from "../swarm/SwarmManager.js";
import type { SwarmCall } from "../swarm/types.js";
import {
  DEFAULT_V4_POOL_MANAGER_BASE_SEPOLIA,
  SQRT_PRICE_X96_1_1,
} from "./constants.js";
import { sendInitializePool, type InitializePoolResult } from "./initializePool.js";
import { buildUmbrellaV4ModifyLiquidityCalls } from "./modifyLiquidityCalls.js";
import { buildDefaultPoolKey, computePoolId, type V4PoolKeyParts } from "./poolKey.js";
import { poolObserverBundle } from "./poolManagerAbi.js";
import {
  registerCreatorForV4Pool,
  type PlatformFeeRegistrationResult,
} from "./PlatformFeeRegistrationService.js";

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Matches v4-core `PoolDonateTest.donate` — deploy a compatible router or use test router on devnets. */
const donateRouterAbi = [
  {
    type: "function",
    name: "donate",
    stateMutability: "payable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/** Split signed liquidity across N agents; sum(outputs) === total. */
function splitSignedBigIntAcrossParts(total: bigint, parts: number): bigint[] {
  if (parts <= 0) throw new Error("parts must be positive");
  const n = BigInt(parts);
  const base = total / n;
  const out = Array.from({ length: parts }, () => base);
  let rem = total - base * n;
  const one = rem > 0n ? 1n : rem < 0n ? -1n : 0n;
  let i = 0;
  while (rem !== 0n && one !== 0n) {
    out[i % parts] += one;
    rem -= one;
    i++;
  }
  return out;
}

function saltForAgentIndex(baseSalt: Hex, index: number): Hex {
  return keccak256(encodePacked(["bytes32", "uint256"], [baseSalt, BigInt(index)]));
}

export type SovereignMissionParams = {
  chainId: number;
  /** Newly deployed ERC-20 (mission token). */
  token: Address;
  /** Optional creator address; used for platform-fee hook revenue share registration. */
  creator?: Address;
  /** Optional Uniswap v4 hook (e.g. mined DeflationHook). */
  hook?: Address;
  /** Second leg of the pool; defaults to WETH on Base. */
  quoteToken?: Address;
  sqrtPriceX96?: bigint;
  poolManager?: Address;
  /**
   * Optional: per-agent donation into the pool for initial in-range depth (requires
   * `UMBRELLA_V4_DONATE_ROUTER` + funded agent accounts + ERC20 approvals path).
   */
  seedDonatePerAgent?: {
    agentCount: number;
    /** wei of currency0 per agent */
    amount0Wei: bigint;
    /** wei of currency1 per agent */
    amount1Wei: bigint;
    staggerMs?: number;
    mnemonic?: string;
  };
  /**
   * Optional: per-agent UmbrellaV4Router.modifyLiquidity (LP on router; requires
   * `UMBRELLA_V4_LIQUIDITY_ROUTER` or `liquidityRouter` + funded agents).
   * Mutually exclusive with `seedDonatePerAgent`.
   */
  seedModifyLiquidityPerAgent?: {
    agentCount: number;
    tickLower: number;
    tickUpper: number;
    /** Total L to deploy; when `thickLiquidity` is true, split evenly across agents. */
    liquidityDelta: bigint;
    salt: Hex;
    hookData?: Hex;
    /**
     * When true, `liquidityDelta` is the **total** wall; each agent receives an equal
     * share (remainder distributed across lower indices).
     */
    thickLiquidity?: boolean;
    staggerMs?: number;
    mnemonic?: string;
  };
  /** Override for v4 liquidity router (defaults to `UMBRELLA_V4_LIQUIDITY_ROUTER`). */
  liquidityRouter?: Address;
};

export type SovereignMissionResult = {
  poolKey: V4PoolKeyParts;
  poolId: Hex;
  sqrtPriceX96: bigint;
  initialize: InitializePoolResult;
  /** If enabled, the on-chain creator registration tx for platform-fee hooks. */
  registration?: PlatformFeeRegistrationResult;
  /** Pass to the dashboard / chart layer. */
  observer: typeof poolObserverBundle & {
    poolId: Hex;
    poolKey: V4PoolKeyParts;
    sqrtPriceX96: string;
  };
  swarm?: SwarmLaunchResult;
};

/**
 * Mandatory v4 pool birth for tradable missions: initialize 1:1 at 0.3% fee on PoolManager,
 * then optionally swarm-seed via donate (`UMBRELLA_V4_DONATE_ROUTER`) **or** modify-liquidity
 * (`UMBRELLA_V4_LIQUIDITY_ROUTER`) — not both.
 */
export async function executeSovereignMission(
  params: SovereignMissionParams,
): Promise<SovereignMissionResult> {
  const poolKey = buildDefaultPoolKey({
    token: params.token,
    quoteToken: params.quoteToken,
    hook: params.hook,
  });

  const sqrt = params.sqrtPriceX96 ?? SQRT_PRICE_X96_1_1;
  const init = await sendInitializePool({
    chainId: params.chainId,
    poolKey,
    sqrtPriceX96: sqrt,
    poolManager: params.poolManager ?? DEFAULT_V4_POOL_MANAGER_BASE_SEPOLIA,
  });

  const poolId = computePoolId(poolKey) as Hex;

  // Optional "fee handshake": if this pool uses the platform-fee hook, register creator.
  let registration: PlatformFeeRegistrationResult | undefined;
  const platformHook = process.env.UMBRELLA_V4_PLATFORM_FEE_HOOK?.trim() as Address | undefined;
  const wantsRegistration = Boolean(platformHook && params.creator && params.hook);
  const hookMatches =
    wantsRegistration && platformHook!.toLowerCase() === (params.hook as string).toLowerCase();
  if (hookMatches) {
    registration = await registerCreatorForV4Pool({
      chainId: params.chainId,
      hook: platformHook!,
      poolKey,
      creator: params.creator!,
    });
  }

  let swarm: SwarmLaunchResult | undefined;
  const seedDonate = params.seedDonatePerAgent;
  const seedModify = params.seedModifyLiquidityPerAgent;

  if (seedDonate && seedModify) {
    throw new Error("Provide only one of seedDonatePerAgent or seedModifyLiquidityPerAgent");
  }

  if (seedModify) {
    const liqRouter = (params.liquidityRouter?.trim() ||
      process.env.UMBRELLA_V4_LIQUIDITY_ROUTER?.trim()) as Address | undefined;
    if (!liqRouter) {
      throw new Error(
        "seedModifyLiquidityPerAgent requires UMBRELLA_V4_LIQUIDITY_ROUTER or liquidityRouter",
      );
    }

    const n = Math.min(32, Math.max(1, seedModify.agentCount));
    const thick = seedModify.thickLiquidity === true;
    const deltas = thick
      ? splitSignedBigIntAcrossParts(seedModify.liquidityDelta, n)
      : Array.from({ length: n }, () => seedModify.liquidityDelta);

    const callsPerAgent: SwarmCall[][] = [];
    for (let i = 0; i < n; i++) {
      const salt = thick ? saltForAgentIndex(seedModify.salt, i) : seedModify.salt;
      const calls = buildUmbrellaV4ModifyLiquidityCalls({
        poolKey,
        router: liqRouter,
        params: {
          tickLower: seedModify.tickLower,
          tickUpper: seedModify.tickUpper,
          liquidityDelta: deltas[i]!,
          salt,
          hookData: seedModify.hookData,
        },
      });
      callsPerAgent.push(calls.map((c) => ({ ...c })));
    }

    swarm = await launchSwarm({
      chainId: params.chainId,
      callsPerAgent,
      staggerMs: seedModify.staggerMs,
      mnemonic: seedModify.mnemonic,
    });
  } else if (seedDonate && (seedDonate.amount0Wei > 0n || seedDonate.amount1Wei > 0n)) {
    const router = process.env.UMBRELLA_V4_DONATE_ROUTER?.trim() as Address | undefined;
    if (!router) {
      throw new Error(
        "seedDonatePerAgent requires UMBRELLA_V4_DONATE_ROUTER (unlock+donate router on this chain)",
      );
    }

    const donateData = encodeFunctionData({
      abi: donateRouterAbi,
      functionName: "donate",
      args: [
        {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        seedDonate.amount0Wei,
        seedDonate.amount1Wei,
        "0x",
      ],
    });

    const callsPerAgent: SwarmCall[][] = [];
    const n = Math.min(32, Math.max(1, seedDonate.agentCount));

    for (let i = 0; i < n; i++) {
      const batch: SwarmCall[] = [];
      if (seedDonate.amount0Wei > 0n) {
        batch.push({
          to: poolKey.currency0,
          data: encodeFunctionData({
            abi: erc20ApproveAbi,
            functionName: "approve",
            args: [router, seedDonate.amount0Wei],
          }),
          value: 0n,
        });
      }
      if (seedDonate.amount1Wei > 0n) {
        batch.push({
          to: poolKey.currency1,
          data: encodeFunctionData({
            abi: erc20ApproveAbi,
            functionName: "approve",
            args: [router, seedDonate.amount1Wei],
          }),
          value: 0n,
        });
      }
      batch.push({
        to: router,
        data: donateData,
        value: 0n,
      });
      callsPerAgent.push(batch);
    }

    swarm = await launchSwarm({
      chainId: params.chainId,
      callsPerAgent,
      staggerMs: seedDonate.staggerMs,
      mnemonic: seedDonate.mnemonic,
    });
  }

  return {
    poolKey,
    poolId,
    sqrtPriceX96: sqrt,
    initialize: init,
    registration,
    observer: {
      ...poolObserverBundle,
      poolId,
      poolKey,
      sqrtPriceX96: sqrt.toString(),
    },
    swarm,
  };
}
