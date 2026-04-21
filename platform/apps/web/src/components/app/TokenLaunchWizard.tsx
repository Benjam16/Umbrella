"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

type Identity = {
  name: string;
  symbol: string;
  imageUrl: string;
};

type Mission = {
  prompt: string;
  category: "trading" | "research" | "execution" | "content" | "other";
};

export type WizardResult = {
  identity: Identity;
  mission: Mission;
  walletAddress: string;
};

type Props = {
  onSubmit?: (result: WizardResult) => Promise<void> | void;
  /**
   * Optional seed values. Used by the Marketplace → Forge "Fork this agent"
   * flow so the wizard opens pre-populated with a public template.
   */
  initial?: Partial<{
    identity: Partial<Identity>;
    mission: Partial<Mission>;
    walletAddress: string;
  }>;
  /** Small banner rendered above the stepper when the wizard was forked. */
  contextNotice?: { label: string; detail?: string };
};

type Step = 1 | 2 | 3;

const CATEGORIES: Array<{ id: Mission["category"]; label: string; hint: string }> = [
  { id: "trading", label: "Trading", hint: "Agent executes on-chain strategies" },
  { id: "research", label: "Research", hint: "Agent produces analysis & briefs" },
  { id: "execution", label: "Execution", hint: "Task-level autonomy and actions" },
  { id: "content", label: "Content", hint: "Creative and narrative output" },
  { id: "other", label: "Other", hint: "Custom purpose" },
];

function isValidWallet(v: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

function symbolize(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function TokenLaunchWizard({ onSubmit, initial, contextNotice }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [identity, setIdentity] = useState<Identity>({
    name: initial?.identity?.name ?? "",
    symbol: initial?.identity?.symbol ?? "",
    imageUrl: initial?.identity?.imageUrl ?? "",
  });
  const [mission, setMission] = useState<Mission>({
    prompt: initial?.mission?.prompt ?? "",
    category: initial?.mission?.category ?? "execution",
  });
  const [wallet, setWallet] = useState(initial?.walletAddress ?? "");
  const { address: connectedAddress, isConnected } = useAccount();
  const [walletTouched, setWalletTouched] = useState(
    Boolean(initial?.walletAddress),
  );

  // Auto-fill from the connected wallet — but only if the user hasn't typed
  // their own value yet (so manually entered treasuries aren't overwritten).
  useEffect(() => {
    if (walletTouched) return;
    if (isConnected && connectedAddress) setWallet(connectedAddress);
  }, [isConnected, connectedAddress, walletTouched]);

  const [showTechnical, setShowTechnical] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validStep1 =
    identity.name.trim().length >= 2 && identity.symbol.trim().length >= 2;
  const validStep2 = mission.prompt.trim().length >= 12;
  const validStep3 = isValidWallet(wallet);

  const canNext = useMemo(() => {
    if (step === 1) return validStep1;
    if (step === 2) return validStep2;
    return validStep3;
  }, [step, validStep1, validStep2, validStep3]);

  async function submit() {
    if (!validStep1 || !validStep2 || !validStep3) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const payload: WizardResult = {
        identity,
        mission,
        walletAddress: wallet.trim(),
      };
      if (onSubmit) await onSubmit(payload);
      setResult(
        `Submitted. Watching Supabase for generated artifacts for ${wallet.trim().slice(0, 6)}...`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-ink-900/60 p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            Token Launch Wizard
          </p>
          <h2 className="text-lg font-semibold text-zinc-100">
            3 steps to forge your agent token
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowTechnical((v) => !v)}
          className="rounded-md border border-zinc-700 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
        >
          {showTechnical ? "Hide technical" : "View technical details"}
        </button>
      </header>

      {contextNotice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-signal-blue/30 bg-signal-blue/5 px-3 py-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
              {contextNotice.label}
            </p>
            {contextNotice.detail && (
              <p className="text-xs text-zinc-300">{contextNotice.detail}</p>
            )}
          </div>
        </div>
      )}

      <StepBar current={step} />

      <div className="mt-5 grid gap-5 md:grid-cols-5">
        <div className="md:col-span-3">
          {step === 1 && (
            <StepIdentity
              identity={identity}
              setIdentity={setIdentity}
              valid={validStep1}
            />
          )}
          {step === 2 && (
            <StepMission mission={mission} setMission={setMission} valid={validStep2} />
          )}
          {step === 3 && (
            <StepForge
              wallet={wallet}
              setWallet={(v) => {
                setWalletTouched(true);
                setWallet(v);
              }}
              walletAutoFilled={
                isConnected && wallet === connectedAddress && !walletTouched
              }
              identity={identity}
              mission={mission}
              valid={validStep3}
              submitting={submitting}
              result={result}
              error={error}
              onSubmit={submit}
            />
          )}
        </div>

        <aside className="md:col-span-2">
          <SummaryPanel identity={identity} mission={mission} wallet={wallet} />
          {showTechnical && (
            <TechnicalPanel identity={identity} mission={mission} wallet={wallet} />
          )}
        </aside>
      </div>

      <footer className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={step === 1 || submitting}
          onClick={() => setStep(((step - 1) || 1) as Step)}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 hover:border-signal-blue hover:text-signal-blue"
        >
          Back
        </button>
        {step < 3 ? (
          <button
            type="button"
            disabled={!canNext}
            onClick={() => setStep(((step + 1) as Step))}
            className="rounded-md bg-signal-blue px-4 py-2 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            disabled={!canNext || submitting}
            onClick={submit}
            className="rounded-md bg-signal-green px-4 py-2 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Forging..." : "Forge Token"}
          </button>
        )}
      </footer>
    </section>
  );
}

function StepBar({ current }: { current: Step }) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: 1, label: "Identity" },
    { id: 2, label: "Mission" },
    { id: 3, label: "Forge" },
  ];
  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => {
        const active = s.id === current;
        const done = s.id < current;
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-mono ${
                active
                  ? "border-signal-blue bg-signal-blue/10 text-signal-blue"
                  : done
                    ? "border-signal-green bg-signal-green/10 text-signal-green"
                    : "border-zinc-700 text-zinc-400"
              }`}
            >
              {s.id}
            </div>
            <span
              className={`text-xs ${
                active ? "text-signal-blue" : done ? "text-signal-green" : "text-zinc-500"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="h-px w-8 bg-zinc-800" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepIdentity({
  identity,
  setIdentity,
  valid,
}: {
  identity: Identity;
  setIdentity: (next: Identity) => void;
  valid: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="Token Name">
        <input
          value={identity.name}
          onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
          placeholder="e.g. Umbrella Research Agent"
          className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-signal-blue"
        />
      </Field>
      <Field label="Symbol" hint="2-6 chars, uppercase">
        <input
          value={identity.symbol}
          onChange={(e) => setIdentity({ ...identity, symbol: symbolize(e.target.value) })}
          placeholder="e.g. URA"
          className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-sm uppercase text-zinc-100 outline-none focus:border-signal-blue"
        />
      </Field>
      <Field label="Image URL (optional)">
        <input
          value={identity.imageUrl}
          onChange={(e) => setIdentity({ ...identity, imageUrl: e.target.value })}
          placeholder="https://..."
          className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-signal-blue"
        />
      </Field>
      {!valid && (
        <p className="text-xs text-zinc-500">Provide at least a name and a 2+ char symbol.</p>
      )}
    </div>
  );
}

function StepMission({
  mission,
  setMission,
  valid,
}: {
  mission: Mission;
  setMission: (next: Mission) => void;
  valid: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="Agent Category">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = mission.category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setMission({ ...mission, category: c.id })}
                className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-widest transition ${
                  active
                    ? "border-signal-blue bg-signal-blue/10 text-signal-blue"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                }`}
                title={c.hint}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="What should this agent do?">
        <textarea
          value={mission.prompt}
          onChange={(e) => setMission({ ...mission, prompt: e.target.value })}
          placeholder="Describe the agent's behavior, goals, and constraints. Example: 'Monitor Base liquidity pools and execute arbitrage when net profit exceeds gas by 15%.'"
          rows={6}
          className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-signal-blue"
        />
      </Field>
      {!valid && (
        <p className="text-xs text-zinc-500">Provide at least 12 characters of mission context.</p>
      )}
    </div>
  );
}

function StepForge({
  wallet,
  setWallet,
  walletAutoFilled,
  identity,
  mission,
  valid,
  submitting,
  result,
  error,
  onSubmit,
}: {
  wallet: string;
  setWallet: (v: string) => void;
  walletAutoFilled?: boolean;
  identity: Identity;
  mission: Mission;
  valid: boolean;
  submitting: boolean;
  result: string | null;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Your Wallet"
        hint={
          walletAutoFilled
            ? "Auto-filled from your connected wallet. Edit to override."
            : "Used to key generated artifacts via Supabase Realtime"
        }
      >
        <div className="relative">
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 pr-20 font-mono text-sm text-zinc-100 outline-none focus:border-signal-blue"
          />
          {walletAutoFilled && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-signal-green/40 bg-signal-green/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-signal-green">
              connected
            </span>
          )}
        </div>
      </Field>

      <div className="rounded-lg border border-zinc-800 bg-ink-950/60 p-4">
        <p className="text-xs text-zinc-400">
          Forge will verify payment to the Umbrella treasury, run the Kimi pipeline, and
          publish generated artifacts to your wallet feed. Output appears below
          automatically once completed.
        </p>
      </div>

      {!valid && (
        <p className="text-xs text-zinc-500">Enter a valid 0x wallet address to continue.</p>
      )}

      {submitting && (
        <div className="rounded-lg border border-signal-blue/40 bg-signal-blue/5 p-3 font-mono text-xs text-signal-blue">
          <p>[forge] queuing launch for {identity.symbol || "TOKEN"}...</p>
          <p>[forge] mission: {mission.category}</p>
          <p>[forge] waiting for on-chain payment + kimi response...</p>
        </div>
      )}
      {result && (
        <div className="rounded-lg border border-signal-green/40 bg-signal-green/5 p-3 text-xs text-signal-green">
          {result}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-3 text-xs text-signal-red">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!valid || submitting}
        className="hidden md:inline-block rounded-md bg-signal-green px-4 py-2 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Forging..." : "Forge Token"}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
        {hint && <span className="ml-2 text-zinc-600">{hint}</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function SummaryPanel({
  identity,
  mission,
  wallet,
}: {
  identity: Identity;
  mission: Mission;
  wallet: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-ink-950/60 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Live Preview
      </p>
      <div className="mt-2 space-y-2 text-sm">
        <p className="text-zinc-300">
          <span className="text-zinc-500">Name: </span>
          {identity.name || <em className="text-zinc-600">pending</em>}
        </p>
        <p className="text-zinc-300">
          <span className="text-zinc-500">Symbol: </span>
          <span className="font-mono">{identity.symbol || "-"}</span>
        </p>
        <p className="text-zinc-300">
          <span className="text-zinc-500">Category: </span>
          <span className="font-mono">{mission.category}</span>
        </p>
        <p className="text-zinc-300">
          <span className="text-zinc-500">Mission: </span>
          <span className="line-clamp-3 block text-xs text-zinc-400">
            {mission.prompt || "-"}
          </span>
        </p>
        <p className="text-zinc-300">
          <span className="text-zinc-500">Wallet: </span>
          <span className="font-mono text-xs">
            {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "-"}
          </span>
        </p>
      </div>
    </div>
  );
}

function TechnicalPanel({
  identity,
  mission,
  wallet,
}: {
  identity: Identity;
  mission: Mission;
  wallet: string;
}) {
  const payload = {
    identity,
    mission,
    walletAddress: wallet,
    pipeline: "kimi → supabase → hook registration",
  };
  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-ink-950/60 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Technical Payload
      </p>
      <pre className="mt-2 max-h-[260px] overflow-auto rounded-md bg-ink-900 p-3 font-mono text-[11px] text-zinc-200">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}
