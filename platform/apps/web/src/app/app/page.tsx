import Link from "next/link";
import { AppTopBar } from "@/components/app/AppTopBar";
import { seedMarketplace } from "@/lib/marketplace";

export default function AppLaunchpadPage() {
  const featured = seedMarketplace().slice(0, 6);
  const aggregates = featured.reduce(
    (acc, l) => {
      acc.tvl += l.pool.tvlUsd;
      acc.rev24h += l.performance.revenue24hUsd;
      acc.missions24h += l.performance.missions24h;
      if (l.performance.active) acc.active += 1;
      return acc;
    },
    { tvl: 0, rev24h: 0, missions24h: 0, active: 0 },
  );

  return (
    <>
      <AppTopBar statusLabel="Launchpad" statusTone="idle" runId={null} />
      <main className="flex-1 overflow-y-auto">
        <section className="border-b border-zinc-800/60 bg-gradient-to-b from-signal-blue/[0.08] to-transparent">
          <div className="mx-auto max-w-[1280px] px-6 py-10">
            <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
              Umbrella · Autonomous Launchpad
            </p>
            <h1 className="mt-2 max-w-4xl text-4xl font-semibold leading-tight text-zinc-100">
              Launch tokens. Deploy swarms.{" "}
              <span className="text-signal-sepia">Run your agent workforce.</span>
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-zinc-400">
              Umbrella makes launching an agent token feel as simple as posting a tweet,
              while still giving operators a full Agent OS underneath. Start with the
              guided wizard, then scale into the workspace.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <BigLaunchCard
                tone="primary"
                eyebrow="3-step guided flow"
                title="Launch Token"
                body="Identity · Mission · Forge. Umbrella takes care of compilation, treasury payment verification, and registry handshake."
                href="/app/forge"
                cta="Start launch wizard"
              />
              <BigLaunchCard
                tone="neutral"
                eyebrow="Agentic execution layer"
                title="Deploy Swarm"
                body="Spin up specialized agents (triage, research, executor) with controlled handoffs, eject-to-local safety, and live DAG telemetry."
                href="/app/workspace"
                cta="Open workspace"
              />
            </div>
          </div>
        </section>

        <section className="border-b border-zinc-800/60">
          <div className="mx-auto grid max-w-[1280px] gap-2 px-6 py-5 sm:grid-cols-4">
            <Vital label="Marketplace TVL" value={formatUsdCompact(aggregates.tvl)} />
            <Vital
              label="Revenue 24h"
              value={formatUsdCompact(aggregates.rev24h)}
              tone="good"
            />
            <Vital
              label="Missions 24h"
              value={aggregates.missions24h.toLocaleString()}
            />
            <Vital label="Active agents" value={String(aggregates.active)} pulse />
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 py-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Marketplace
              </p>
              <h2 className="text-xl font-semibold text-zinc-100">
                Active agents earning on Umbrella
              </h2>
            </div>
            <Link
              href="/app/marketplace"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
            >
              Full marketplace →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((agent) => (
              <article
                key={agent.id}
                className="flex flex-col rounded-xl border border-zinc-800 bg-ink-900/60 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      {agent.symbol}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-zinc-100">
                      {agent.name}
                    </h3>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                      agent.performance.active
                        ? "bg-signal-green/10 text-signal-green"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {agent.performance.active ? "live" : "idle"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-400 line-clamp-3">{agent.tagline}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Missions 24h" value={agent.performance.missions24h} />
                  <Stat label="TVL" value={formatUsdCompact(agent.pool.tvlUsd)} />
                  <Stat
                    label="Revenue 24h"
                    value={formatUsdCompact(agent.performance.revenue24hUsd)}
                    tone="good"
                  />
                  <Stat label="Category" value={agent.category} />
                </dl>
                <Link
                  href={`/app/marketplace/${agent.id}`}
                  className="mt-4 inline-block rounded-md border border-signal-blue/60 px-3 py-1.5 text-center text-xs text-signal-blue hover:bg-signal-blue/10"
                >
                  View agent →
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 pb-8">
          <div className="rounded-2xl border border-zinc-800/80 bg-ink-900/50 p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
              How launching works
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-100">Simple Launch Flow</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">
              Every token launch follows the same 3-step path. Power users can expand
              technical details inside the wizard at any step.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <StepCard
                step="1"
                title="Identity"
                text="Name, symbol, and branding. No contract engineering required."
              />
              <StepCard
                step="2"
                title="Mission"
                text="Describe what your agent does in plain language."
              />
              <StepCard
                step="3"
                title="Forge"
                text="Umbrella compiles, verifies payment, and publishes launch artifacts."
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/app/forge"
                className="rounded-md bg-signal-blue px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-signal-blue/90"
              >
                Start launch wizard
              </Link>
              <Link
                href="/docs"
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
              >
                Read launch docs
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-zinc-800/60 bg-ink-950/80">
          <div className="mx-auto max-w-[1280px] px-6 py-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Workspace · Engine Room
                </p>
                <h2 className="text-xl font-semibold text-zinc-100">
                  Advanced Agent OS for operators
                </h2>
              </div>
              <Link
                href="/app/workspace"
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
              >
                Enter workspace →
              </Link>
            </div>
            <p className="max-w-3xl text-sm text-zinc-400">
              The full mission composer, DAG visualizer, run logs, artifact panel, and
              eject-to-local controls live in the dedicated workspace route. Launchpad
              users stay in a simple flow; power users get a high-density OS underneath.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

function BigLaunchCard({
  tone,
  eyebrow,
  title,
  body,
  href,
  cta,
}: {
  tone: "primary" | "neutral";
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  const primary = tone === "primary";
  return (
    <Link
      href={href}
      className={`group relative flex flex-col gap-3 rounded-2xl border p-6 transition ${
        primary
          ? "border-signal-blue/30 bg-gradient-to-br from-signal-blue/[0.08] to-transparent hover:border-signal-blue"
          : "border-zinc-800 bg-ink-900/60 hover:border-zinc-600"
      }`}
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {eyebrow}
      </p>
      <h3
        className={`text-2xl font-semibold ${
          primary ? "text-signal-blue" : "text-zinc-100"
        }`}
      >
        {title}
      </h3>
      <p className="text-sm text-zinc-400">{body}</p>
      <span
        className={`mt-2 inline-block font-mono text-xs uppercase tracking-widest ${
          primary
            ? "text-signal-blue"
            : "text-zinc-300 group-hover:text-signal-blue"
        }`}
      >
        {cta} →
      </span>
    </Link>
  );
}

function StepCard({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-ink-950/70 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
        Step {step}
      </p>
      <h3 className="mt-1 text-sm font-semibold text-zinc-100">{title}</h3>
      <p className="mt-2 text-xs text-zinc-400">{text}</p>
    </div>
  );
}

function Vital({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: string;
  tone?: "good";
  pulse?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-ink-900/60 px-3 py-2">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
        {pulse && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-signal-green" />
        )}
      </div>
      <div
        className={`mt-1 font-mono text-[15px] ${
          tone === "good" ? "text-signal-green" : "text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good";
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-ink-950/50 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-xs ${
          tone === "good" ? "text-signal-green" : "text-zinc-200"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function formatUsdCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
