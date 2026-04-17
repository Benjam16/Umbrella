import type { TransactionProposal } from "@umbrella/shared";

type OnChainTxAction = {
  network: "base";
  to: string;
  data: string;
  value: string;
  description?: string;
};

type WalletConfig = {
  baseChainId: number;
  defaultTarget: string;
  provider: "local" | "coinbase_agentkit";
  coinbaseApiKeyId?: string;
  coinbaseApiKeySecret?: string;
  coinbaseWalletSecret?: string;
};

function walletConfig(): WalletConfig {
  return {
    baseChainId: Number(process.env.UMBRELLA_BASE_CHAIN_ID ?? 8453),
    defaultTarget:
      process.env.UMBRELLA_DEFAULT_TRANSACTION_TARGET ??
      "0x0000000000000000000000000000000000000000",
    provider:
      process.env.UMBRELLA_WALLET_PROVIDER === "coinbase_agentkit"
        ? "coinbase_agentkit"
        : "local",
    coinbaseApiKeyId: process.env.UMBRELLA_COINBASE_API_KEY_ID?.trim(),
    coinbaseApiKeySecret: process.env.UMBRELLA_COINBASE_API_KEY_SECRET?.trim(),
    coinbaseWalletSecret: process.env.UMBRELLA_COINBASE_WALLET_SECRET?.trim(),
  };
}

type AgentKitRuntime = {
  getActions: () => unknown[];
};

type WalletRuntimeHint = {
  provider: "local" | "coinbase_agentkit";
  availableActions?: number;
  warning?: string;
};

export type WalletStatus = {
  provider: "local" | "coinbase_agentkit";
  ready: boolean;
  missing: string[];
  warning?: string;
  availableActions?: number;
};

let cachedAgentKit: Promise<AgentKitRuntime | null> | null = null;

async function loadCoinbaseAgentKit(cfg: WalletConfig): Promise<AgentKitRuntime | null> {
  if (cfg.provider !== "coinbase_agentkit") return null;
  if (!cfg.coinbaseApiKeyId || !cfg.coinbaseApiKeySecret || !cfg.coinbaseWalletSecret) {
    return null;
  }
  if (!cachedAgentKit) {
    cachedAgentKit = (async () => {
      const mod = await import("@coinbase/agentkit");
      const agentKit = await mod.AgentKit.from({
        cdpApiKeyId: cfg.coinbaseApiKeyId,
        cdpApiKeySecret: cfg.coinbaseApiKeySecret,
        cdpWalletSecret: cfg.coinbaseWalletSecret,
      });
      return {
        getActions: () => agentKit.getActions(),
      } satisfies AgentKitRuntime;
    })().catch(() => null);
  }
  return cachedAgentKit;
}

async function walletRuntimeHint(cfg: WalletConfig): Promise<WalletRuntimeHint> {
  if (cfg.provider !== "coinbase_agentkit") return { provider: "local" };
  try {
    const runtime = await loadCoinbaseAgentKit(cfg);
    if (!runtime) {
      return {
        provider: "coinbase_agentkit",
        warning: "Coinbase AgentKit unavailable (missing creds or init failure), using local proposal mode.",
      };
    }
    return {
      provider: "coinbase_agentkit",
      availableActions: runtime.getActions().length,
    };
  } catch {
    return {
      provider: "coinbase_agentkit",
      warning: "Coinbase AgentKit initialization failed, using local proposal mode.",
    };
  }
}

export async function getWalletStatus(): Promise<WalletStatus> {
  const cfg = walletConfig();
  if (cfg.provider === "local") {
    return { provider: "local", ready: true, missing: [] };
  }

  const missing: string[] = [];
  if (!cfg.coinbaseApiKeyId) missing.push("UMBRELLA_COINBASE_API_KEY_ID");
  if (!cfg.coinbaseApiKeySecret) missing.push("UMBRELLA_COINBASE_API_KEY_SECRET");
  if (!cfg.coinbaseWalletSecret) missing.push("UMBRELLA_COINBASE_WALLET_SECRET");
  if (missing.length > 0) {
    return {
      provider: "coinbase_agentkit",
      ready: false,
      missing,
      warning: "Coinbase AgentKit credentials are incomplete.",
    };
  }

  const hint = await walletRuntimeHint(cfg);
  if (hint.warning) {
    return {
      provider: "coinbase_agentkit",
      ready: false,
      missing: [],
      warning: hint.warning,
      availableActions: hint.availableActions,
    };
  }
  return {
    provider: "coinbase_agentkit",
    ready: true,
    missing: [],
    availableActions: hint.availableActions,
  };
}

/**
 * Adapter point for Coinbase AgentKit-backed transaction proposals.
 * Current implementation normalizes proposal payloads for HITL signing flow.
 */
export async function createTransactionProposal(input: {
  title: string;
  proposal?: Partial<TransactionProposal>;
  fallbackData?: string;
  fallbackValue?: string;
}): Promise<TransactionProposal> {
  const cfg = walletConfig();
  const hint = await walletRuntimeHint(cfg);
  const sourceSuffix =
    hint.provider === "coinbase_agentkit"
      ? hint.warning
        ? ` [coinbase_agentkit:fallback]`
        : ` [coinbase_agentkit${typeof hint.availableActions === "number" ? `:${hint.availableActions}_actions` : ""}]`
      : " [local_wallet]";
  return {
    chainId: input.proposal?.chainId ?? cfg.baseChainId,
    to: input.proposal?.to ?? cfg.defaultTarget,
    from: input.proposal?.from,
    data: input.proposal?.data ?? input.fallbackData ?? "0x",
    value: input.proposal?.value ?? input.fallbackValue ?? "0x0",
    gas: input.proposal?.gas,
    description:
      `${input.proposal?.description?.trim() || `Sign transaction for task: ${input.title}`}${sourceSuffix}`,
  };
}

export async function createProposalFromOnChainAction(
  action: OnChainTxAction,
): Promise<TransactionProposal> {
  const cfg = walletConfig();
  const hint = await walletRuntimeHint(cfg);
  const sourceSuffix =
    hint.provider === "coinbase_agentkit"
      ? hint.warning
        ? ` [coinbase_agentkit:fallback]`
        : ` [coinbase_agentkit${typeof hint.availableActions === "number" ? `:${hint.availableActions}_actions` : ""}]`
      : " [local_wallet]";
  return {
    chainId: cfg.baseChainId,
    to: action.to,
    data: action.data,
    value: action.value || "0",
    description:
      `${action.description?.trim() || `Proposed ${action.network} on-chain transaction`}${sourceSuffix}`,
  };
}
