"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAccount,
  useSignTypedData,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { base, baseSepolia } from "viem/chains";
import { createPublicClient, http, type Address, type Chain, type Hex } from "viem";
import { AppTopBar } from "@/components/app/AppTopBar";
import { TokenLaunchWizard, type WizardResult } from "@/components/app/TokenLaunchWizard";
import { LaunchStatusPanel } from "@/components/forge/LaunchStatusPanel";
import { agentTokenFactoryAbi, erc20PermitAbi } from "@/lib/launch/abi";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import {
  markLaunchError,
  markLaunchReady,
  newLaunchId,
  upsertPendingLaunch,
} from "@/lib/recent-launches";
import { SUPPORTED_CHAIN_IDS } from "@/lib/wallet/config";

type HookRow = {
  id: string;
  wallet_address: string;
  tx_hash: string;
  model: string;
  created_at: string;
  solidity_code: string;
};

type ForkTemplate = {
  id: string;
  prompt: string;
  model: string;
};

type LaunchQuote = {
  chainId: number;
  factoryAddress: Address;
  curveFactoryAddress: Address;
  treasuryAddress: Address;
  defaultAttester: Address;
  launchFeeWei: string;
  launchFeeHex: string;
  graduationThresholdWei: string;
  predictedTokenAddress: Address | null;
  initialSupply: string;
};

export default function ForgePage() {
  return (
    <Suspense fallback={null}>
      <ForgeView />
    </Suspense>
  );
}

function ForgeView() {
  const { address: connectedWallet, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();
  const searchParams = useSearchParams();
  const templateId = searchParams?.get("template") ?? null;
  const [wallet, setWallet] = useState("");
  const [hooks, setHooks] = useState<HookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [template, setTemplate] = useState<ForkTemplate | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [activeHookId, setActiveHookId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const normalizedWallet = useMemo(() => wallet.trim().toLowerCase(), [wallet]);

  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      setTemplateError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/forge/templates/${encodeURIComponent(templateId)}`);
        if (!res.ok) {
          if (!cancelled) setTemplateError("template not found or no longer public");
          return;
        }
        const data = (await res.json()) as { template: ForkTemplate };
        if (!cancelled) {
          setTemplate(data.template);
          setTemplateError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTemplateError(err instanceof Error ? err.message : "failed to load template");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  async function load() {
    if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/forge/hooks?wallet=${normalizedWallet}`);
      const data = (await res.json()) as { hooks?: HookRow[] };
      setHooks(data.hooks ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedWallet]);

  useEffect(() => {
    if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`generated-hooks-${normalizedWallet}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "generated_hooks",
          filter: `wallet_address=eq.${normalizedWallet}`,
        },
        (payload) => {
          const row = payload.new as HookRow;
          setHooks((prev) => [row, ...prev.filter((x) => x.id !== row.id)]);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [normalizedWallet]);

  async function handleSubmit(result: WizardResult) {
    setLaunchError(null);
    if (!isConnected || !connectedWallet) {
      throw new Error("Connect wallet before launching.");
    }
    if (connectedWallet.toLowerCase() !== result.walletAddress.toLowerCase()) {
      throw new Error("Wallet address must match connected wallet.");
    }
    if (!walletClient) throw new Error("Wallet client not ready. Reconnect and retry.");
    if (
      chainId !== undefined &&
      !(SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId)
    ) {
      throw new Error("Switch your wallet to Base or Base Sepolia before launching.");
    }

    const blueprintId = deriveBlueprintId(result);
    const initialSupply = 1_000_000_000n * 10n ** 18n; // 1B token default supply.

    const preferredChainId =
      chainId === 8453 || chainId === 84532 ? chainId : undefined;
    const quote = await fetchLaunchQuote({
      walletAddress: result.walletAddress,
      name: result.identity.name,
      symbol: result.identity.symbol,
      blueprint: blueprintId,
      supply: initialSupply.toString(),
      preferredChainId,
    });

    if (chainId !== quote.chainId) {
      try {
        await switchChainAsync({ chainId: quote.chainId });
      } catch (switchErr) {
        const hint =
          switchErr instanceof Error ? switchErr.message : "Could not switch network.";
        throw new Error(
          `Your wallet must be on ${quote.chainId === 8453 ? "Base" : "Base Sepolia"} (chain ${quote.chainId}) before forging. ${hint}`,
        );
      }
    }

    const launchId = newLaunchId();
    upsertPendingLaunch({
      id: launchId,
      walletAddress: result.walletAddress,
      name: result.identity.name,
      symbol: result.identity.symbol,
      category: result.mission.category,
      launchType: result.launchType,
      prompt: result.mission.prompt,
      status: "initializing",
      createdAt: Date.now(),
    });

    try {
      const factoryTxHash = await submitFactoryTx({
        walletClient: walletClient as unknown as AnyWalletClient,
        quote,
        identity: result.identity,
        blueprintId,
        initialSupply,
      });

      const tokenAddress = await resolveDeployedTokenAddress({
        chainId: quote.chainId,
        txHash: factoryTxHash,
        factoryAddress: quote.factoryAddress,
        blueprintId,
      });

      const permit = await signPermit({
        signTypedDataAsync: signTypedDataAsync as unknown as (
          args: Record<string, unknown>,
        ) => Promise<Hex>,
        chainId: quote.chainId,
        tokenAddress,
        owner: result.walletAddress as Address,
        spender: quote.curveFactoryAddress,
        value: initialSupply,
      });

      const launchRes = await fetch("/api/v1/forge/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: result.walletAddress,
          factoryTxHash,
          chainId: quote.chainId,
          launchType: result.launchType,
          identity: result.identity,
          mission: result.mission,
          permit,
          forkedFrom: template?.id ?? null,
          ...(result.initialBuyEth
            ? { initialBuyEth: result.initialBuyEth }
            : {}),
        }),
      });
      if (!launchRes.ok) {
        const err = await launchRes.json().catch(() => ({ error: "launch failed" }));
        throw new Error(err?.error ?? "launch failed");
      }
      const data = (await launchRes.json()) as {
        launch?: { hookId?: string; tokenAddress?: string; curveAddress?: string };
      };
      if (data.launch?.hookId) {
        setActiveHookId(data.launch.hookId);
        markLaunchReady(launchId, {
          hookId: data.launch.hookId,
          tokenAddress: data.launch.tokenAddress,
          chainId: quote.chainId,
          launchType: result.launchType,
        });
      }
      setWallet(result.walletAddress);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "launch failed";
      markLaunchError(launchId, msg);
      setLaunchError(msg);
      throw err instanceof Error ? err : new Error(msg);
    }
  }

  return (
    <>
      <AppTopBar statusLabel="forge" statusTone="idle" />
      <main className="flex-1 overflow-y-auto">
        <section className="border-b border-zinc-800/60 bg-gradient-to-b from-signal-blue/[0.06] to-transparent">
          <div className="mx-auto max-w-[1180px] px-6 py-8">
            <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
              Umbrella · Forge
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-100">
              Launch a sovereign token or full agent
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-zinc-400">
              Your wallet deploys the token, Umbrella deploys the mission record + bonding curve
              with one permit signature, and trading opens immediately on a pump.fun-style curve.
              When the curve fills, the agent graduates into Umbrella-managed liquidity.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-[1180px] space-y-6 px-6 py-6">
          {templateError && (
            <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/5 px-3 py-2 font-mono text-[11px] text-signal-amber">
              {templateError}
            </div>
          )}
          {launchError && (
            <div className="rounded-lg border border-signal-red/40 bg-signal-red/5 px-3 py-2 font-mono text-[11px] text-signal-red">
              {launchError}
            </div>
          )}
          {activeHookId && (
            <LaunchStatusPanel hookId={activeHookId} onClose={() => setActiveHookId(null)} />
          )}
          <TokenLaunchWizard
            key={template?.id ?? "blank"}
            onSubmit={handleSubmit}
            initial={
              template
                ? { mission: { prompt: template.prompt, category: "research" } }
                : undefined
            }
            contextNotice={
              template
                ? {
                    label: `Forked from ${template.id.slice(0, 8)}…`,
                    detail: `Model: ${template.model}. Prompt copied — edit any step before launching.`,
                  }
                : undefined
            }
          />

          <section className="rounded-xl border border-zinc-800 bg-ink-900/60 p-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Generated Artifacts</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Enter or launch with a wallet to see your generated agents appear here.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  placeholder="0x wallet to track"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  className="w-60 rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-signal-blue"
                />
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
                >
                  {showRaw ? "Hide source" : "View source"}
                </button>
              </div>
            </header>

            {loading && <p className="mt-4 text-sm text-zinc-400">Loading...</p>}

            {!loading && hooks.length === 0 && (
              <p className="mt-4 rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
                No artifacts yet. Complete a launch to populate this feed.
              </p>
            )}

            <div className="mt-4 space-y-3">
              {hooks.map((h) => (
                <article
                  key={h.id}
                  className="rounded-lg border border-zinc-800 bg-ink-950/80 p-3"
                >
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                    <span>{new Date(h.created_at).toLocaleString()}</span>
                    <span>{h.model}</span>
                    <span className="font-mono">{h.tx_hash.slice(0, 12)}...</span>
                  </div>
                  {showRaw && (
                    <pre className="mt-3 max-h-[360px] overflow-auto rounded-md bg-ink-900 p-3 text-xs text-zinc-200">
                      {h.solidity_code}
                    </pre>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Launch helpers
// ---------------------------------------------------------------------------

function deriveBlueprintId(result: WizardResult): string {
  const stamp = Date.now().toString(36);
  const slug = result.identity.symbol
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  const kind = result.launchType === "token" ? "sv" : "ag";
  return `umbrella-${kind}-${slug}-${stamp}`;
}

async function fetchLaunchQuote(args: {
  walletAddress: string;
  name: string;
  symbol: string;
  blueprint: string;
  supply: string;
  /** When set, prepare uses this chain so the quote matches the connected wallet. */
  preferredChainId?: 8453 | 84532;
}): Promise<LaunchQuote> {
  const url = new URL("/api/v1/forge/launch/prepare", window.location.origin);
  url.searchParams.set("wallet", args.walletAddress);
  url.searchParams.set("name", args.name);
  url.searchParams.set("symbol", args.symbol.toUpperCase());
  url.searchParams.set("blueprint", args.blueprint);
  url.searchParams.set("supply", args.supply);
  if (args.preferredChainId !== undefined) {
    url.searchParams.set("chainId", String(args.preferredChainId));
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `prepare failed: ${res.status}`);
  }
  return (await res.json()) as LaunchQuote;
}

type AnyWalletClient = {
  account?: { address: Address };
  chain?: { id: number } | null;
  writeContract: (args: {
    account: Address;
    chain?: Chain;
    address: Address;
    abi: unknown;
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
  }) => Promise<Hex>;
};

function launchChainForQuote(chainId: number): Chain {
  if (chainId === 8453) return base;
  if (chainId === 84532) return baseSepolia;
  throw new Error(`unsupported launch chain ${chainId}`);
}

async function submitFactoryTx(args: {
  walletClient: AnyWalletClient;
  quote: LaunchQuote;
  identity: WizardResult["identity"];
  blueprintId: string;
  initialSupply: bigint;
}): Promise<Hex> {
  const { walletClient, quote } = args;
  if (!walletClient.account?.address) {
    throw new Error("Wallet account unavailable. Reconnect and retry.");
  }
  const launchChain = launchChainForQuote(quote.chainId);
  const txHash = await walletClient.writeContract({
    account: walletClient.account.address,
    chain: launchChain,
    address: quote.factoryAddress,
    abi: agentTokenFactoryAbi,
    functionName: "createAgentToken",
    args: [
      args.identity.name,
      args.identity.symbol.toUpperCase(),
      args.blueprintId,
      args.initialSupply,
    ],
    value: BigInt(quote.launchFeeWei),
  });
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error("factory tx did not return a valid hash");
  }
  return txHash;
}

function makeLaunchPublicClient(chainId: number) {
  const chain = chainId === 8453 ? base : chainId === 84532 ? baseSepolia : null;
  if (!chain) throw new Error(`unsupported launch chain ${chainId}`);
  const rpcUrl = chainId === 8453 ? "https://mainnet.base.org" : "https://sepolia.base.org";
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

/**
 * Prefer `tokenFor(blueprintId)` over log decoding: `string indexed` in
 * `AgentTokenCreated` can decode to the wrong `token` topic mapping in some
 * clients, leading to reads against a non-contract and empty `nonces` data.
 */
async function resolveDeployedTokenAddress(args: {
  chainId: number;
  txHash: Hex;
  factoryAddress: Address;
  blueprintId: string;
}): Promise<Address> {
  const pub = makeLaunchPublicClient(args.chainId);
  const receipt = await pub.waitForTransactionReceipt({ hash: args.txHash });
  if (receipt.status !== "success") throw new Error("factory tx reverted on-chain");
  const token = (await pub.readContract({
    address: args.factoryAddress,
    abi: agentTokenFactoryAbi,
    functionName: "tokenFor",
    args: [args.blueprintId],
  })) as Address;
  if (!token || token.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "Factory did not register a token for this blueprint. Confirm the deployment transaction succeeded.",
    );
  }
  return token;
}

async function signPermit(args: {
  signTypedDataAsync: (args: Record<string, unknown>) => Promise<Hex>;
  chainId: number;
  tokenAddress: Address;
  owner: Address;
  spender: Address;
  value: bigint;
}): Promise<{ deadline: string; v: number; r: Hex; s: Hex }> {
  const pub = makeLaunchPublicClient(args.chainId);
  const code = await pub.getBytecode({ address: args.tokenAddress });
  if (!code || code === "0x") {
    throw new Error(
      `No contract code at ${args.tokenAddress} on chain ${args.chainId}. Check the deployment network and try again.`,
    );
  }
  const [rawName, nonce] = await Promise.all([
    pub.readContract({ address: args.tokenAddress, abi: erc20PermitAbi, functionName: "name" }),
    pub.readContract({
      address: args.tokenAddress,
      abi: erc20PermitAbi,
      functionName: "nonces",
      args: [args.owner],
    }),
  ]);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
  const domain = {
    name: rawName as string,
    version: "1",
    chainId: args.chainId,
    verifyingContract: args.tokenAddress,
  };
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const message = {
    owner: args.owner,
    spender: args.spender,
    value: args.value,
    nonce: nonce as bigint,
    deadline,
  };

  const signature = (await args.signTypedDataAsync({
    domain,
    types,
    primaryType: "Permit",
    message,
  })) as Hex;

  const sig = signature.slice(2);
  const r = `0x${sig.slice(0, 64)}` as Hex;
  const s = `0x${sig.slice(64, 128)}` as Hex;
  const v = parseInt(sig.slice(128, 130), 16);
  return { deadline: deadline.toString(), v, r, s };
}
