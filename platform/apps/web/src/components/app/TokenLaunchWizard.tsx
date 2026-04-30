"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { resolvePublicAssetUrl } from "@/lib/resolvePublicAssetUrl";

type Identity = {
  name: string;
  symbol: string;
  imageUrl: string;
};

type Mission = {
  prompt: string;
  category: "trading" | "research" | "execution" | "content" | "other";
};

export type LaunchType = "agent" | "token";

export type WizardResult = {
  launchType: LaunchType;
  /** Optional first buy on the bonding curve after launch (ETH, decimal string). */
  initialBuyEth?: string;
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
    launchType: LaunchType;
    identity: Partial<Identity>;
    mission: Partial<Mission>;
    walletAddress: string;
  }>;
  /** Small banner rendered above the stepper when the wizard was forked. */
  contextNotice?: { label: string; detail?: string };
};

type Step = 1 | 2 | 3 | 4;

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
  const [launchType, setLaunchType] = useState<LaunchType>(initial?.launchType ?? "agent");
  const [initialBuyEth, setInitialBuyEth] = useState("");
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

  const validStep1 = launchType === "agent" || launchType === "token";
  const validStep2 =
    identity.name.trim().length >= 2 && identity.symbol.trim().length >= 2;
  const promptMin = launchType === "agent" ? 12 : 4;
  const validStep3 = mission.prompt.trim().length >= promptMin;
  const validStep4 = isValidWallet(wallet);

  const canNext = useMemo(() => {
    if (step === 1) return validStep1;
    if (step === 2) return validStep2;
    if (step === 3) return validStep3;
    return validStep4;
  }, [step, validStep1, validStep2, validStep3, validStep4]);

  async function submit() {
    if (!validStep1 || !validStep2 || !validStep3 || !validStep4) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const buy = initialBuyEth.trim();
      const payload: WizardResult = {
        launchType,
        initialBuyEth: buy && Number(buy) > 0 ? buy : undefined,
        identity,
        mission,
        walletAddress: wallet.trim(),
      };
      if (onSubmit) await onSubmit(payload);
      setResult(`Submitted. Watching launch progress for ${wallet.trim().slice(0, 6)}...`);
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
            Four steps to launch on Umbrella
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
            <StepLaunchType launchType={launchType} onChange={setLaunchType} />
          )}
          {step === 2 && (
            <StepIdentity
              identity={identity}
              setIdentity={setIdentity}
              valid={validStep2}
              wallet={wallet}
            />
          )}
          {step === 3 && (
            <StepMission
              mission={mission}
              setMission={setMission}
              valid={validStep3}
              launchType={launchType}
            />
          )}
          {step === 4 && (
            <StepForge
              wallet={wallet}
              setWallet={(v) => {
                setWalletTouched(true);
                setWallet(v);
              }}
              initialBuyEth={initialBuyEth}
              setInitialBuyEth={setInitialBuyEth}
              walletAutoFilled={
                isConnected && wallet === connectedAddress && !walletTouched
              }
              identity={identity}
              mission={mission}
              launchType={launchType}
              valid={validStep4}
              submitting={submitting}
              result={result}
              error={error}
              onSubmit={submit}
            />
          )}
        </div>

        <aside className="md:col-span-2">
          <SummaryPanel
            launchType={launchType}
            identity={identity}
            mission={mission}
            wallet={wallet}
            initialBuyEth={initialBuyEth}
          />
          {showTechnical && (
            <TechnicalPanel identity={identity} mission={mission} wallet={wallet} />
          )}
        </aside>
      </div>

      <footer className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={step === 1 || submitting}
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : 1))}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 hover:border-signal-blue hover:text-signal-blue"
        >
          Back
        </button>
        {step < 4 ? (
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
    { id: 1, label: "Type" },
    { id: 2, label: "Identity" },
    { id: 3, label: "Mission" },
    { id: 4, label: "Forge" },
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

function StepLaunchType({
  launchType,
  onChange,
}: {
  launchType: LaunchType;
  onChange: (t: LaunchType) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Choose whether you are launching a full <span className="text-zinc-200">AI agent token</span>{" "}
        (mission hooks, Gunnr-style enforcement, attested runs) or a{" "}
        <span className="text-zinc-200">sovereign token</span> without the agentic stack.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange("agent")}
          className={`rounded-xl border p-4 text-left transition ${
            launchType === "agent"
              ? "border-signal-blue bg-signal-blue/10"
              : "border-zinc-800 bg-ink-950 hover:border-zinc-600"
          }`}
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">Agent</p>
          <p className="mt-2 text-sm font-semibold text-zinc-100">Agent + workforce</p>
          <p className="mt-1 text-xs text-zinc-500">
            Full mission pipeline, Kimi hook, and on-chain attestation story.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onChange("token")}
          className={`rounded-xl border p-4 text-left transition ${
            launchType === "token"
              ? "border-signal-green bg-signal-green/10"
              : "border-zinc-800 bg-ink-950 hover:border-zinc-600"
          }`}
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-green">Token</p>
          <p className="mt-2 text-sm font-semibold text-zinc-100">Sovereign asset</p>
          <p className="mt-1 text-xs text-zinc-500">
            Standard launch: curve + trading, minimal agent attachments.
          </p>
        </button>
      </div>
    </div>
  );
}

function StepIdentity({
  identity,
  setIdentity,
  valid,
  wallet,
}: {
  identity: Identity;
  setIdentity: (next: Identity) => void;
  valid: boolean;
  wallet: string;
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
      <Field label="Token Image (optional)" hint="PNG, JPG, WEBP or GIF · up to 2MB">
        <ImageUploadField
          imageUrl={identity.imageUrl}
          onChange={(url) => setIdentity({ ...identity, imageUrl: url })}
          wallet={wallet}
        />
      </Field>
      {!valid && (
        <p className="text-xs text-zinc-500">Provide at least a name and a 2+ char symbol.</p>
      )}
    </div>
  );
}

function ImageUploadField({
  imageUrl,
  onChange,
  wallet,
}: {
  imageUrl: string;
  onChange: (url: string) => void;
  wallet: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setError("Unsupported file type. Use PNG, JPG, WEBP or GIF.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("File too large. Max 2MB.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (/^0x[a-fA-F0-9]{40}$/.test(wallet)) form.append("wallet", wallet);
      const res = await fetch("/api/v1/forge/image", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error || `upload failed (${res.status})`);
      }
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    // Reset so re-picking the same file still triggers change.
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  const hasImage = Boolean(imageUrl);

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex items-center gap-3 rounded-md border border-dashed p-3 transition ${
          dragging
            ? "border-signal-blue bg-signal-blue/5"
            : hasImage
              ? "border-zinc-800 bg-ink-950"
              : "border-zinc-800 bg-ink-950 hover:border-zinc-700"
        }`}
      >
        <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-ink-900">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvePublicAssetUrl(imageUrl) || imageUrl}
              alt="Token preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              preview
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-300">
            {uploading
              ? "Uploading…"
              : hasImage
                ? "Image attached."
                : "Drop a file here or click Upload."}
          </p>
          {hasImage && !uploading && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">
              {imageUrl}
            </p>
          )}
        </div>

        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-signal-blue/40 bg-signal-blue/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-signal-blue transition hover:border-signal-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : hasImage ? "Replace" : "Upload"}
          </button>
          {hasImage && !uploading && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-md border border-zinc-800 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 transition hover:border-signal-red hover:text-signal-red"
            >
              Remove
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onFilePicked}
          className="hidden"
        />
      </div>

      {error && (
        <p className="mt-2 font-mono text-[10px] text-signal-red">{error}</p>
      )}
    </div>
  );
}

function StepMission({
  mission,
  setMission,
  valid,
  launchType,
}: {
  mission: Mission;
  setMission: (next: Mission) => void;
  valid: boolean;
  launchType: LaunchType;
}) {
  const agentCopy = launchType === "agent";
  return (
    <div className="space-y-4">
      <Field label={agentCopy ? "Agent category" : "Label (optional grouping)"}>
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
      <Field
        label={agentCopy ? "What should this agent do?" : "Token note"}
        hint={agentCopy ? undefined : "Short description for metadata and Kimi — 4+ characters."}
      >
        <textarea
          value={mission.prompt}
          onChange={(e) => setMission({ ...mission, prompt: e.target.value })}
          placeholder={
            agentCopy
              ? "Describe the agent's behavior, goals, and constraints. Example: 'Monitor Base liquidity pools and execute arbitrage when net profit exceeds gas by 15%.'"
              : "e.g. 'Community memecoin with fixed supply and bonding-curve distribution.'"
          }
          rows={6}
          className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-signal-blue"
        />
      </Field>
      {!valid && (
        <p className="text-xs text-zinc-500">
          {agentCopy
            ? "Provide at least 12 characters of mission context."
            : "Provide at least 4 characters (token launches stay lightweight)."}
        </p>
      )}
    </div>
  );
}

function StepForge({
  wallet,
  setWallet,
  initialBuyEth,
  setInitialBuyEth,
  walletAutoFilled,
  identity,
  mission,
  launchType,
  valid,
  submitting,
  result,
  error,
  onSubmit,
}: {
  wallet: string;
  setWallet: (v: string) => void;
  initialBuyEth: string;
  setInitialBuyEth: (v: string) => void;
  walletAutoFilled?: boolean;
  identity: Identity;
  mission: Mission;
  launchType: LaunchType;
  valid: boolean;
  submitting: boolean;
  result: string | null;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Optional: creator snipe (ETH)"
        hint="Bundled into the server relay’s createCurve transaction — tokens go to you in the same block. The Umbrella deployer wallet must hold this ETH plus gas (see UMBRELLA_DEPLOYER_PRIVATE_KEY in env)."
      >
        <input
          value={initialBuyEth}
          onChange={(e) => setInitialBuyEth(e.target.value)}
          inputMode="decimal"
          placeholder="0 — skip"
          className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-signal-blue"
        />
      </Field>
      <Field
        label="Your Wallet"
        hint={
          walletAutoFilled
            ? "Auto-filled from your connected wallet. Edit to override."
            : "Used to attach this launch to your workspace"
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
          Forge deploys your token from your wallet, then the server calls Kimi
          {launchType === "agent" ? " with full agent constraints" : " with a minimal sovereign hook"} and
          opens the bonding curve so the token trades inside Umbrella first (not an immediate Uniswap
          listing). Supply is fixed at mint.
        </p>
      </div>

      {!valid && (
        <p className="text-xs text-zinc-500">Enter a valid 0x wallet address to continue.</p>
      )}

      {submitting && (
        <div className="rounded-lg border border-signal-blue/40 bg-signal-blue/5 p-3 font-mono text-xs text-signal-blue">
          <p>[forge] signing factory + permit in your wallet, then server pipeline…</p>
          <p>
            [forge] mode: {launchType} · mission: {mission.category}
          </p>
          <p>
            [forge] Kimi runs on the server (not in the browser). This usually takes 1–3 minutes:
            verify token → generate Solidity → deploy mission record → bonding curve → tradeable on
            Umbrella (Uniswap v4 only after curve graduation).
          </p>
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
  launchType,
  identity,
  mission,
  wallet,
  initialBuyEth,
}: {
  launchType: LaunchType;
  identity: Identity;
  mission: Mission;
  wallet: string;
  initialBuyEth: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-ink-950/60 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Live Preview
      </p>
      <div className="mt-2 space-y-2 text-sm">
        <p className="text-zinc-300">
          <span className="text-zinc-500">Type: </span>
          <span className="font-mono">
            {launchType === "agent" ? "Agent (full stack)" : "Sovereign token"}
          </span>
        </p>
        {initialBuyEth.trim() && (
          <p className="text-zinc-300">
            <span className="text-zinc-500">Creator snipe: </span>
            <span className="font-mono">{initialBuyEth.trim()} ETH</span>
          </p>
        )}
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
    pipeline: "kimi → supabase → hook registration (agent mode includes Gunnr-style enforcement hints in the server prompt)",
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
