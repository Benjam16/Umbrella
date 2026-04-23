"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { ensureWalletSession } from "@/lib/client-wallet-auth";

type Size = "sm" | "md";

type Props = {
  size?: Size;
  /** Render only the minimal "Connect" variant (no chain switcher / details). */
  compact?: boolean;
};

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Terminal-styled wallet button. Handles three states:
 *   · Disconnected → opens a small connector picker (Injected / Coinbase)
 *   · Connected on a supported chain → address pill + disconnect popover
 *   · Connected on the wrong chain → "Switch to Base" warning
 *
 * Note: we only render chain-dependent UI after hydration to avoid SSR
 * mismatch (wagmi is purely client-side).
 */
export function ConnectWalletButton({ size = "md", compact }: Props) {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChain, isPending: switching } = useSwitchChain();

  const [mounted, setMounted] = useState(false);
  const [openPicker, setOpenPicker] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  useEffect(() => {
    if (!isConnected || !address) {
      setSessionWallet(null);
      return;
    }
    const wallet = address.toLowerCase();
    if (sessionWallet === wallet) return;
    void ensureWalletSession({ walletAddress: wallet, signMessageAsync })
      .then(() => setSessionWallet(wallet))
      .catch(() => {
        // Keep connect UX smooth; protected endpoints will still request auth.
      });
  }, [isConnected, address, signMessageAsync, sessionWallet]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpenPicker(false);
        setOpenDetails(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const onWrongChain =
    isConnected && chainId !== base.id && chainId !== baseSepolia.id;

  const pad = size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]";

  // Render a stable placeholder until mount to keep SSR/CSR markup identical.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden
        className={`rounded-md border border-zinc-700 bg-ink-900/60 font-mono uppercase tracking-wider text-zinc-400 ${pad}`}
      >
        Connect
      </button>
    );
  }

  if (!isConnected) {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpenPicker((v) => !v)}
          className={`rounded-md border border-signal-blue/50 bg-signal-blue/10 font-mono uppercase tracking-wider text-signal-blue transition hover:border-signal-blue ${pad}`}
        >
          Connect wallet
        </button>
        {openPicker && (
          <div className="absolute right-0 z-50 mt-1 w-[220px] overflow-hidden rounded-md border border-zinc-800 bg-ink-950/95 shadow-xl backdrop-blur">
            <p className="border-b border-zinc-800/70 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Choose wallet
            </p>
            <ul>
              {connectors.map((c) => (
                <li key={c.uid}>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      connect({ connector: c });
                      setOpenPicker(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left font-mono text-[11px] text-zinc-200 hover:bg-zinc-800/40 disabled:opacity-60"
                  >
                    <span>{c.name}</span>
                    <span className="text-[9px] uppercase tracking-widest text-zinc-500">
                      {c.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {error && (
              <p className="border-t border-zinc-800/70 px-3 py-1.5 font-mono text-[10px] text-signal-red">
                {error.message}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (onWrongChain && !compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => switchChain({ chainId: base.id })}
          disabled={switching}
          className={`rounded-md border border-signal-amber/60 bg-signal-amber/10 font-mono uppercase tracking-wider text-signal-amber hover:border-signal-amber ${pad}`}
        >
          {switching ? "Switching…" : "Switch to Base"}
        </button>
        <button
          type="button"
          onClick={() => disconnect()}
          className={`rounded-md border border-zinc-700 font-mono uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue ${pad}`}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpenDetails((v) => !v)}
        className={`flex items-center gap-2 rounded-md border border-signal-green/40 bg-signal-green/10 font-mono uppercase tracking-wider text-signal-green hover:border-signal-green ${pad}`}
        title={address}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal-green" />
        {address ? short(address) : "Connected"}
      </button>
      {openDetails && address && (
        <div className="absolute right-0 z-50 mt-1 w-[240px] overflow-hidden rounded-md border border-zinc-800 bg-ink-950/95 shadow-xl backdrop-blur">
          <div className="border-b border-zinc-800/70 px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Connected
            </p>
            <p className="font-mono text-[11px] text-zinc-200 break-all">
              {address}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              {chainId === base.id
                ? "Base mainnet"
                : chainId === baseSepolia.id
                  ? "Base Sepolia"
                  : `Chain ${chainId}`}
            </p>
          </div>
          <div className="flex items-center gap-2 p-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(address);
              }}
              className="flex-1 rounded-md border border-zinc-800 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                disconnect();
                setOpenDetails(false);
              }}
              className="flex-1 rounded-md border border-zinc-800 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-signal-red hover:text-signal-red"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
