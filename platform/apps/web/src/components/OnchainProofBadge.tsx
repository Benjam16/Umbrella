"use client";

import { motion } from "framer-motion";
import type { OnchainAnchor } from "@umbrella/runner";

type Props = {
  anchor: OnchainAnchor;
};

/**
 * "Anchored on-chain" badge rendered on the run replay page once the
 * RelayerService has posted a ProofOfSuccess + tx hash. Clicking the tx
 * hash opens BaseScan in a new tab.
 */
export function OnchainProofBadge({ anchor }: Props) {
  const href = explorerLinkFor(anchor.chainId, anchor.txHash);
  const chainLabel = chainName(anchor.chainId);
  const successPct = (anchor.proof.successScore / 100).toFixed(1);

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-signal-green/30 bg-signal-green/[0.04] p-4 shadow-[0_0_48px_-14px_rgba(34,211,166,0.35)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-signal-green">
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-green"
              aria-hidden
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-signal-green/60" />
            </span>
            Anchored on-chain
          </p>
          <p className="mt-1 text-[13px] text-zinc-200">
            Proof-of-Success settled on <span className="font-mono">{chainLabel}</span> via the Umbrella Performance Hook.
          </p>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          <div>score</div>
          <div className="mt-0.5 text-[14px] text-signal-green">{successPct}%</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-zinc-800/80 bg-ink-950/60 p-2 font-mono text-[11px] text-zinc-400 sm:grid-cols-3">
        <Row label="token">{short(anchor.tokenAddress)}</Row>
        <Row label="attester">{short(anchor.attester)}</Row>
        <Row label="tx">{short(anchor.txHash, 10)}</Row>
        <Row label="revenue">${(anchor.proof.revenueCents / 100).toFixed(2)}</Row>
        <Row label="nodes">{anchor.proof.nodesExecuted}</Row>
        <Row label="gas">
          {anchor.paymasterSponsored ? (
            <span className="text-signal-green">sponsored · paymaster</span>
          ) : (
            <span className="text-zinc-500">user-paid</span>
          )}
        </Row>
      </div>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-signal-green/40 bg-signal-green/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-signal-green hover:border-signal-green"
        >
          View on {chainLabel === "base-sepolia" ? "Sepolia BaseScan" : "BaseScan"} ↗
        </a>
      ) : (
        <p className="mt-3 font-mono text-[10px] text-zinc-600">
          no explorer configured for chain id {anchor.chainId}
        </p>
      )}
    </motion.section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="uppercase tracking-widest text-zinc-600">{label}</span>
      <span className="truncate text-zinc-200">{children}</span>
    </div>
  );
}

function short(hex: string, head = 6): string {
  if (!hex.startsWith("0x")) return hex;
  return `${hex.slice(0, 2 + head)}…${hex.slice(-4)}`;
}

function chainName(chainId: number): string {
  switch (chainId) {
    case 8453:
      return "base";
    case 84532:
      return "base-sepolia";
    case 1:
      return "ethereum";
    default:
      return `chain-${chainId}`;
  }
}

function explorerLinkFor(chainId: number, txHash: string): string | null {
  switch (chainId) {
    case 8453:
      return `https://basescan.org/tx/${txHash}`;
    case 84532:
      return `https://sepolia.basescan.org/tx/${txHash}`;
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    default:
      return null;
  }
}
