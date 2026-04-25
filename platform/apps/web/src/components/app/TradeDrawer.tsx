"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { erc20Abi, formatEther, parseEther, zeroAddress, type Address, type Hex } from "viem";

import type { AgentListing } from "@/lib/marketplace";
import { formatUsd } from "@/lib/marketplace";
import { addressExplorerUrl } from "@/lib/chains/explorer";
import { bondingCurveAbi, umbrellaV4SimpleSwapAbi, weth9Abi } from "@/lib/launch/abi";
import { ensureWalletSession } from "@/lib/client-wallet-auth";
import {
  WETH_ADDRESS,
  buildDefaultV4PoolKey,
  tokenIsCurrency0,
  v4SwapRouterForChain,
  wethIsCurrency0,
} from "@/lib/v4/poolKey";

type Side = "buy" | "sell";

type Props = {
  listing: AgentListing;
  open: boolean;
  onClose: () => void;
  initialSide?: Side;
};

/**
 * In-app pump.fun-style swap. While the agent's curve is `active`, the user
 * trades directly against the UmbrellaBondingCurve contract (buy with ETH,
 * sell tokens back to the curve). Once the curve graduates, in-app v4
 * WETH/TOKEN swaps run through UmbrellaV4SimpleSwap when configured
 * (wrap -> approve -> swap; sells optionally unwrap to ETH).
 */
export function TradeDrawer({ listing, open, onClose, initialSide = "buy" }: Props) {
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ tokensOut?: bigint; ethInGross?: bigint; ethOutNet?: bigint } | null>(null);

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const curve = listing.curve ?? null;
  const curveAddress = (curve?.address ?? "") as Address | "";
  const curveChainId = curve?.chainId ?? null;
  const tradeChainId = curveChainId ?? chainId;
  const v4SwapRouter = useMemo(() => v4SwapRouterForChain(tradeChainId), [tradeChainId]);
  const tokenAddress = listing.token?.address as string | undefined;
  const tokenAddressOk = Boolean(
    tokenAddress && /^0x[a-fA-F0-9]{40}$/i.test(tokenAddress),
  );
  const canTradeActive = curve?.stage === "active" && /^0x[a-fA-F0-9]{40}$/i.test(curveAddress);
  const canTradeGraduated = curve?.stage === "graduated";
  const canV4Swap = Boolean(canTradeGraduated && tokenAddressOk && v4SwapRouter);
  const canTrade = canTradeActive || canV4Swap;

  const publicClient = usePublicClient({
    chainId: tradeChainId,
  });

  useEffect(() => {
    if (!open) return;
    setSide(initialSide);
    setSubmitError(null);
    setSuccessMessage(null);
    setAmount("");
    setQuote(null);
  }, [open, initialSide]);

  const parsed = Number(amount);

  const refreshQuote = useCallback(async () => {
    if (!publicClient || !curveAddress || !canTradeActive) {
      setQuote(null);
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setQuote(null);
      return;
    }
    try {
      if (side === "buy") {
        const ethIn = parseEther(amount as `${number}`);
        const tokensOut = (await publicClient.readContract({
          address: curveAddress,
          abi: bondingCurveAbi,
          functionName: "previewBuyFromEth",
          args: [ethIn],
        })) as bigint;
        setQuote({ tokensOut, ethInGross: ethIn });
      } else {
        const tokensIn = parseEther(amount as `${number}`);
        const [ethOutNet] = (await publicClient.readContract({
          address: curveAddress,
          abi: bondingCurveAbi,
          functionName: "quoteSell",
          args: [tokensIn],
        })) as [bigint, bigint];
        setQuote({ ethOutNet, tokensOut: tokensIn });
      }
    } catch {
      setQuote(null);
    }
  }, [amount, publicClient, curveAddress, canTradeActive, parsed, side]);

  useEffect(() => {
    if (!open) return;
    void refreshQuote();
  }, [open, refreshQuote]);

  const progress = useMemo(() => {
    if (!curve) return 0;
    const threshold = safeBigInt(curve.graduationThresholdWei);
    const reserve = safeBigInt(curve.ethReserveWei);
    if (threshold <= 0n) return 0;
    const pct = Number((reserve * 10_000n) / threshold) / 100;
    return Math.min(100, Math.max(0, pct));
  }, [curve]);

  const glow =
    listing.performance.successRate >= 0.95
      ? "border-signal-green/40 shadow-[0_0_40px_-10px_rgba(34,211,166,0.4)]"
      : "border-zinc-800";

  async function executeTrade() {
    setSubmitError(null);
    setSuccessMessage(null);
    if (!isConnected || !address) {
      setSubmitError("Connect wallet to continue.");
      return;
    }
    if (!canTrade) {
      if (canTradeGraduated) {
        setSubmitError(
          !tokenAddressOk
            ? "Token address missing for this listing."
            : !v4SwapRouter
              ? "V4 in-app swap is not configured. Set NEXT_PUBLIC_UMBRELLA_V4_SWAP_ROUTER_SEPOLIA (or _BASE) to your deployed UmbrellaV4SimpleSwap address."
              : "Cannot trade on this market.",
        );
      } else {
        setSubmitError("Curve not active yet for this agent.");
      }
      return;
    }
    if (!walletClient || !publicClient) {
      setSubmitError("Wallet not ready. Reconnect and retry.");
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSubmitError("Enter an amount greater than zero.");
      return;
    }
    if (chainId !== tradeChainId) {
      try {
        await switchChainAsync({ chainId: tradeChainId });
      } catch (err) {
        setSubmitError(`Switch to chain ${tradeChainId} to trade: ${err instanceof Error ? err.message : ""}`);
        return;
      }
    }

    try {
      setSubmitting(true);
      await ensureWalletSession({ walletAddress: address, signMessageAsync });

      // Non-blocking intent log — Umbrella portfolio uses this to reconcile.
      void fetch("/api/v1/trades/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          hookId: listing.id,
          side,
          amountUsd: parsed,
          tokenAmount: parsed,
        }),
      }).catch(() => {});

      let txHash: Hex;
      if (canV4Swap) {
        const tokenAddr = tokenAddress as Address;
        const hookRaw = listing.pool?.hookAddress;
        const hooks: Address =
          hookRaw && /^0x[a-fA-F0-9]{40}$/i.test(hookRaw) ? (hookRaw as Address) : zeroAddress;
        const poolKey = buildDefaultV4PoolKey({ token: tokenAddr, hooks });
        const router = v4SwapRouter as Address;
        const minV4Out = 0n; // no on-chain quote yet; see UmbrellaV4SimpleSwap slippage
        if (side === "buy") {
          const wethIn = parseEther(amount as `${number}`);
          const depHash = await walletClient.writeContract({
            account: walletClient.account!,
            chain: walletClient.chain,
            address: WETH_ADDRESS,
            abi: weth9Abi,
            functionName: "deposit",
            value: wethIn,
          });
          await publicClient.waitForTransactionReceipt({ hash: depHash });
          const wethAllow = (await publicClient.readContract({
            address: WETH_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, router],
          })) as bigint;
          if (wethAllow < wethIn) {
            const ap = await walletClient.writeContract({
              account: walletClient.account!,
              chain: walletClient.chain,
              address: WETH_ADDRESS,
              abi: erc20Abi,
              functionName: "approve",
              args: [router, wethIn],
            });
            await publicClient.waitForTransactionReceipt({ hash: ap });
          }
          const zfo = wethIsCurrency0(poolKey);
          txHash = await walletClient.writeContract({
            account: walletClient.account!,
            chain: walletClient.chain,
            address: router,
            abi: umbrellaV4SimpleSwapAbi,
            functionName: "swapExactIn",
            args: [poolKey, zfo, wethIn, minV4Out, "0x"],
          });
        } else {
          const tokensIn = parseEther(amount as `${number}`);
          const tAllow = (await publicClient.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, router],
          })) as bigint;
          if (tAllow < tokensIn) {
            const ap = await walletClient.writeContract({
              account: walletClient.account!,
              chain: walletClient.chain,
              address: tokenAddr,
              abi: erc20Abi,
              functionName: "approve",
              args: [router, tokensIn],
            });
            await publicClient.waitForTransactionReceipt({ hash: ap });
          }
          const wethBefore = (await publicClient.readContract({
            address: WETH_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          })) as bigint;
          const zfo = tokenIsCurrency0({ token: tokenAddr, key: poolKey });
          txHash = await walletClient.writeContract({
            account: walletClient.account!,
            chain: walletClient.chain,
            address: router,
            abi: umbrellaV4SimpleSwapAbi,
            functionName: "swapExactIn",
            args: [poolKey, zfo, tokensIn, minV4Out, "0x"],
          });
          await publicClient.waitForTransactionReceipt({ hash: txHash });
          const wethAfter = (await publicClient.readContract({
            address: WETH_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          })) as bigint;
          const wethOut = wethAfter - wethBefore;
          if (wethOut > 0n) {
            const wdraw = await walletClient.writeContract({
              account: walletClient.account!,
              chain: walletClient.chain,
              address: WETH_ADDRESS,
              abi: weth9Abi,
              functionName: "withdraw",
              args: [wethOut],
            });
            await publicClient.waitForTransactionReceipt({ hash: wdraw });
          }
        }
        if (side === "buy") {
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        }
      } else {
        if (side === "buy") {
          const ethIn = parseEther(amount as `${number}`);
          const tokensOut = (await publicClient.readContract({
            address: curveAddress as Address,
            abi: bondingCurveAbi,
            functionName: "previewBuyFromEth",
            args: [ethIn],
          })) as bigint;
          if (tokensOut === 0n) throw new Error("curve quoted 0 tokens — try a larger amount");
          const minOut = (tokensOut * 95n) / 100n; // 5% slippage tolerance
          txHash = await walletClient.writeContract({
            account: walletClient.account!,
            chain: walletClient.chain,
            address: curveAddress as Address,
            abi: bondingCurveAbi,
            functionName: "buy",
            args: [minOut, ethIn],
            value: ethIn,
          });
        } else {
          const tokensIn = parseEther(amount as `${number}`);
          const allowance = (await publicClient.readContract({
            address: listing.token.address as Address,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, curveAddress as Address],
          })) as bigint;
          if (allowance < tokensIn) {
            const approveHash = await walletClient.writeContract({
              account: walletClient.account!,
              chain: walletClient.chain,
              address: listing.token.address as Address,
              abi: erc20Abi,
              functionName: "approve",
              args: [curveAddress as Address, tokensIn],
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
          }
          const [ethOutNet] = (await publicClient.readContract({
            address: curveAddress as Address,
            abi: bondingCurveAbi,
            functionName: "quoteSell",
            args: [tokensIn],
          })) as [bigint, bigint];
          const minEth = (ethOutNet * 95n) / 100n;
          txHash = await walletClient.writeContract({
            account: walletClient.account!,
            chain: walletClient.chain,
            address: curveAddress as Address,
            abi: bondingCurveAbi,
            functionName: "sell",
            args: [tokensIn, minEth],
          });
        }
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }
      setSuccessMessage(`Trade confirmed. tx: ${txHash.slice(0, 10)}…${txHash.slice(-4)}`);
      setAmount("");
      setQuote(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "trade failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="trade-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            key="trade-panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`w-[min(420px,calc(100vw-32px))] rounded-2xl border ${glow} bg-ink-900/95 p-5`}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {curve?.stage === "graduated"
                    ? "Graduated liquidity · Umbrella router"
                    : "Umbrella Bonding Curve"}
                </div>
                <div className="mt-1 text-lg font-semibold text-zinc-100">
                  {listing.name}
                  <span className="ml-2 font-mono text-[13px] text-zinc-500">{listing.symbol}</span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-zinc-500">
                  {formatUsd(listing.price.usd)} · {listing.performance.missions24h} missions · 24h
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-100"
              >
                esc
              </button>
            </div>

            {curve && curve.stage !== "graduated" && (
              <div className="mb-4 rounded-md border border-zinc-800 bg-ink-950 p-3">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  <span>Graduation progress</span>
                  <span className="text-zinc-300">{progress.toFixed(1)}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-signal-blue to-signal-green"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-2 font-mono text-[10px] text-zinc-500">
                  {formatEther(safeBigInt(curve.ethReserveWei))} /{" "}
                  {formatEther(safeBigInt(curve.graduationThresholdWei))} ETH
                </p>
              </div>
            )}

            <div className="mb-4 flex gap-1 rounded-lg border border-zinc-800 p-1">
              {(["buy", "sell"] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`flex-1 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
                    side === s
                      ? s === "buy"
                        ? "bg-signal-green/15 text-signal-green"
                        : "bg-signal-red/15 text-signal-red"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {side === "buy" ? "Pay (ETH)" : `Sell (${listing.symbol})`}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2.5 text-right font-mono text-[20px] text-zinc-100 outline-none focus:border-signal-blue"
              />
            </label>

            <div className="mt-3 rounded-md border border-zinc-800 bg-ink-950 p-3 font-mono text-[11px] text-zinc-400">
              <Row label="You receive">
                {canV4Swap
                  ? "— (v4 quote not loaded)"
                  : quote?.tokensOut && side === "buy"
                    ? `${formatEther(quote.tokensOut).slice(0, 10)} ${listing.symbol}`
                    : quote?.ethOutNet && side === "sell"
                      ? `${formatEther(quote.ethOutNet).slice(0, 10)} ETH`
                      : "—"}
              </Row>
              <Row label="Slippage tolerance">{canV4Swap ? "0 (MVP — add quoter)" : "5%"}</Row>
              <Row label="Curve stage">{curve?.stage ?? "pending"}</Row>
              <Row label="Curve">
                {curveAddress
                  ? `${curveAddress.slice(0, 6)}…${curveAddress.slice(-4)}`
                  : "—"}
              </Row>
            </div>

            <button
              type="button"
              disabled={!canTrade || !Number.isFinite(parsed) || parsed <= 0 || submitting}
              onClick={executeTrade}
              className={`mt-4 w-full rounded-md border py-2.5 font-mono text-[12px] uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40 ${
                side === "buy"
                  ? "border-signal-green/40 bg-signal-green/10 text-signal-green hover:border-signal-green"
                  : "border-signal-red/40 bg-signal-red/10 text-signal-red hover:border-signal-red"
              }`}
            >
              {submitting
                ? "Confirming…"
                : side === "buy"
                  ? `Buy ${listing.symbol}`
                  : `Sell ${listing.symbol}`}
            </button>
            {submitError && (
              <p className="mt-2 text-center font-mono text-[10px] text-signal-red">{submitError}</p>
            )}
            {successMessage && (
              <p className="mt-2 text-center font-mono text-[10px] text-signal-green">{successMessage}</p>
            )}

            <p className="mt-3 text-center text-[10px] text-zinc-600">
              {canTradeActive
                ? "Trades route directly into the UmbrellaBondingCurve contract."
                : canV4Swap
                  ? "Graduated: swaps use Umbrella's in-app router. Buys wrap ETH first."
                  : canTradeGraduated
                    ? "This curve has graduated. In-app graduated swaps are not enabled for this market yet."
                    : "Trading opens automatically when the launch pipeline completes."}
            </p>
            {canTradeGraduated && listing.token?.address && (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <a
                  href={addressExplorerUrl(curveChainId ?? chainId, listing.token.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] uppercase tracking-widest text-signal-blue hover:underline"
                >
                  Token on BaseScan
                </a>
                {listing.pool?.hookAddress && (
                  <a
                    href={addressExplorerUrl(curveChainId ?? chainId, listing.pool.hookAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] uppercase tracking-widest text-signal-blue hover:underline"
                  >
                    Pool hook
                  </a>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200">{children}</span>
    </div>
  );
}

function safeBigInt(value: string | undefined | null): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
