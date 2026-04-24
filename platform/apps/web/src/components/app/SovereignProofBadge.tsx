"use client";

import { contractCodeExplorerUrl } from "@/lib/chains/explorer";
import { ExternalLinkIcon } from "@/components/icons/ExternalLinkIcon";

const ZERO = "0x0000000000000000000000000000000000000000";

export type SovereignProofBadgeProps = {
  chainId: number | null | undefined;
  missionVerifiedAt: string | null | undefined;
  curveVerifiedAt: string | null | undefined;
  /** Mission record (`UmbrellaAgentMissionRecord`) */
  missionContractAddress: string | null | undefined;
  /** `UmbrellaBondingCurve` */
  curveContractAddress: string | null | undefined;
};

function isValidAddr(a: string | null | undefined): a is string {
  return (
    typeof a === "string" && /^0x[a-fA-F0-9]{40}$/i.test(a) && a.toLowerCase() !== ZERO
  );
}

/**
 * Hoverable "Sovereign proof" control: Basescan verification for mission
 * record + bonding curve. Gold accent when both are verified.
 */
export function SovereignProofBadge({
  chainId,
  missionVerifiedAt,
  curveVerifiedAt,
  missionContractAddress,
  curveContractAddress,
}: SovereignProofBadgeProps) {
  const mOk = Boolean(missionVerifiedAt) && isValidAddr(missionContractAddress);
  const cOk = Boolean(curveVerifiedAt) && isValidAddr(curveContractAddress);
  if (!mOk && !cOk) return null;

  const dual = mOk && cOk;
  const shieldClass = dual
    ? "text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]"
    : "text-zinc-400";

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        className="rounded-md p-0.5 outline-none ring-signal-blue/50 transition hover:opacity-90 focus-visible:ring-2"
        aria-label="Sovereign proof: explorer verification for mission and curve contracts"
        title="Sovereign proof"
      >
        <ShieldIcon className={`h-4 w-4 ${shieldClass}`} />
      </button>

      <div
        className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-zinc-700/90 bg-ink-950/98 p-3 text-left shadow-xl ring-1 ring-black/20 backdrop-blur-sm group-hover:pointer-events-auto group-hover:block group-focus-within:pointer-events-auto group-focus-within:block"
        role="tooltip"
      >
        <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
          Sovereign proof
        </p>
        <ul className="space-y-2.5 text-[11px] text-zinc-200">
          <ProofRow
            ok={mOk}
            label="Mission logic verified"
            href={
              mOk
                ? contractCodeExplorerUrl(chainId, missionContractAddress as string)
                : null
            }
          />
          <ProofRow
            ok={cOk}
            label="Bonding curve verified"
            href={
              cOk
                ? contractCodeExplorerUrl(chainId, curveContractAddress as string)
                : null
            }
          />
        </ul>
      </div>
    </div>
  );
}

function ProofRow({
  ok,
  label,
  href,
}: {
  ok: boolean;
  label: string;
  href: string | null;
}) {
  return (
    <li className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <span
          className={ok ? "text-signal-green" : "text-zinc-600"}
          aria-hidden
        >
          {ok ? "✓" : "○"}
        </span>
        <span className={ok ? "text-zinc-100" : "text-zinc-500"}>{label}</span>
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-5 inline-flex w-fit items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-signal-blue hover:underline"
        >
          View code on Basescan
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      ) : !ok ? (
        <span className="ml-5 font-mono text-[10px] text-zinc-600">Pending</span>
      ) : null}
    </li>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 1L3.5 4.5v5.1c0 4.4 2.4 8.4 6.2 10.2l2.3 1.1 2.3-1.1c3.8-1.8 6.2-5.8 6.2-10.2V4.5L12 1z"
      />
    </svg>
  );
}
