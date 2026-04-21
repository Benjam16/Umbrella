import { createPublicClient, http, type Address, type Hex } from "viem";
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
  type SmartAccount,
} from "viem/account-abstraction";
import { base, baseSepolia } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import type { SwarmCall } from "./types.js";

export type SwarmLaunchParams = {
  /** BIP-39 phrase; prefer `UMBRELLA_SWARM_MNEMONIC` env over request body in production. */
  mnemonic?: string;
  chainId: number;
  /** @deprecated Prefer `uniformCalls` or `callsPerAgent`. */
  target?: Address;
  /** @deprecated Prefer `uniformCalls` or `callsPerAgent`. */
  callData?: Hex;
  /** Same UserOp call batch for every agent (e.g. identical swaps). */
  uniformCalls?: SwarmCall[];
  /** One batch per agent — use for split work (e.g. different recipients). Length = fleet size. */
  callsPerAgent?: SwarmCall[][];
  /** Explicit fleet size when using `uniformCalls` or legacy single-call mode. */
  agentCount?: number;
  /** Heuristic fleet sizing when `agentCount` omitted (1–10). */
  complexity?: number;
  /** Heuristic: ~ceil(steps/2) agents, capped at 32. */
  planStepCount?: number;
  /** Delay between UserOps (organic pacing). */
  staggerMs?: number;
};

export type SwarmLaunchResult = {
  userOpHashes: Hex[];
  smartAccountAddresses: Address[];
  explorerBase: string;
  agentCount: number;
};

function cdpTransport() {
  const url = process.env.CDP_PAYMASTER_URL;
  if (!url) throw new Error("CDP_PAYMASTER_URL is required for gasless swarm UserOperations");
  return http(url, {
    fetchOptions: {
      headers: {
        ...(process.env.CDP_PROJECT_ID
          ? { "x-cdp-project-id": process.env.CDP_PROJECT_ID }
          : {}),
      },
    },
  });
}

function chainFor(id: number) {
  if (id === 8453) return base;
  if (id === 84532) return baseSepolia;
  throw new Error(`Unsupported chainId ${id} for swarm (use 84532 or 8453)`);
}

function explorerBase(chainId: number): string {
  if (chainId === 84532) return "https://sepolia.basescan.org";
  return "https://basescan.org";
}

/**
 * Decide fleet size when the caller does not fix `callsPerAgent.length`.
 * User intent is the constant; N is fluid (more complex plans → more agents by default).
 */
export function resolveAgentCount(input: {
  explicit?: number;
  complexity?: number;
  planStepCount?: number;
}): number {
  if (input.explicit != null && input.explicit > 0) {
    return Math.min(32, Math.max(1, Math.floor(input.explicit)));
  }
  if (input.planStepCount != null && input.planStepCount > 0) {
    return Math.min(32, Math.max(1, Math.ceil(input.planStepCount / 2)));
  }
  if (input.complexity != null && input.complexity >= 1 && input.complexity <= 10) {
    return Math.min(32, Math.max(1, Math.round(2 + input.complexity * 2.5)));
  }
  return 1;
}

function callsForAgent(params: SwarmLaunchParams, agentIndex: number): SwarmCall[] {
  if (params.callsPerAgent?.length) {
    const batch = params.callsPerAgent[agentIndex];
    if (!batch?.length) {
      throw new Error(`callsPerAgent[${agentIndex}] is missing or empty`);
    }
    return batch;
  }
  if (params.uniformCalls?.length) {
    return params.uniformCalls;
  }
  if (params.target && params.callData) {
    return [{ to: params.target, data: params.callData, value: 0n }];
  }
  throw new Error(
    "Provide callsPerAgent, uniformCalls, or target+callData for swarm execution",
  );
}

/**
 * Spins up N Coinbase Smart Accounts from consecutive HD paths under one mnemonic,
 * then sends staggered sponsored `sendUserOperation` calls. Each agent can run a
 * distinct batch (`callsPerAgent`) or share the same batch (`uniformCalls` / legacy target).
 *
 * For Uniswap v4 seeding, use `callsPerAgent` from `executeSovereignMission`:
 * donate (`UMBRELLA_V4_DONATE_ROUTER`) or modify-liquidity (`UMBRELLA_V4_LIQUIDITY_ROUTER`).
 */
export async function launchSwarm(params: SwarmLaunchParams): Promise<SwarmLaunchResult> {
  const mnemonic =
    params.mnemonic?.trim() || process.env.UMBRELLA_SWARM_MNEMONIC?.trim();
  if (!mnemonic) {
    throw new Error(
      "Set UMBRELLA_SWARM_MNEMONIC or pass mnemonic (dev only — never ship mnemonic in client)",
    );
  }

  const chain = chainFor(params.chainId);
  const transport = cdpTransport();
  const publicClient = createPublicClient({ chain, transport });

  let n: number;
  if (params.callsPerAgent?.length) {
    n = Math.min(32, Math.max(1, params.callsPerAgent.length));
  } else {
    n = resolveAgentCount({
      explicit: params.agentCount,
      complexity: params.complexity,
      planStepCount: params.planStepCount,
    });
  }

  const stagger = params.staggerMs ?? 0;

  const userOpHashes: Hex[] = [];
  const smartAccountAddresses: Address[] = [];

  for (let i = 0; i < n; i++) {
    const owner = mnemonicToAccount(mnemonic, {
      path: `m/44'/60'/0'/0/${i}` as const,
    });
    const smartAccount: SmartAccount = await toCoinbaseSmartAccount({
      client: publicClient,
      owners: [owner],
      version: "1.1",
    });

    const bundlerClient = createBundlerClient({
      account: smartAccount,
      client: publicClient,
      chain,
      transport,
      paymaster: true,
    });

    const calls = callsForAgent(params, i).map((c) => ({
      to: c.to,
      data: c.data,
      value: c.value,
    }));

    const hash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls,
      paymaster: true,
    });

    userOpHashes.push(hash);
    smartAccountAddresses.push(smartAccount.address);

    console.log(
      `[swarm] agent ${i + 1}/${n} userOp=${hash} smartAccount=${smartAccount.address} calls=${calls.length}`,
    );

    if (stagger > 0 && i < n - 1) {
      await new Promise((r) => setTimeout(r, stagger));
    }
  }

  return {
    userOpHashes,
    smartAccountAddresses,
    explorerBase: explorerBase(params.chainId),
    agentCount: n,
  };
}
