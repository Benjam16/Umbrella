import { CeoBriefingTile } from "@/components/CeoBriefingTile";
import { DrHealthBar } from "@/components/DrHealthBar";
import { HeroTerminal } from "@/components/HeroTerminal";
import { RiskPolicyWidget } from "@/components/RiskPolicyWidget";
import { SelfHealingTile } from "@/components/SelfHealingTile";
import { ShadowDag } from "@/components/ShadowDag";
import { SwarmOrchestrationTile } from "@/components/SwarmOrchestrationTile";
import { demoData } from "@/lib/demo-data";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-grid-fade pb-24">
      <header className="mx-auto max-w-6xl px-4 pt-10 sm:pt-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-blue">Umbrella Agentic OS</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
          Command Bento — sovereign workstation, live on the glass.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Not a passive landing page: a{" "}
          <span className="text-zinc-200">simulated runner</span>,{" "}
          <span className="text-zinc-200">shadow DAG</span>, and{" "}
          <span className="text-zinc-200">policy + DR</span> signals — the same mental model as the desktop + API stack
          in <code className="font-mono text-signal-amber">platform/</code>.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="https://github.com/Benjam16/Umbrella"
            className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-2 font-medium text-zinc-200 hover:border-signal-blue/40"
          >
            GitHub
          </Link>
          <Link
            href="https://www.npmjs.com/package/@benjam16/umbrella"
            className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-2 font-medium text-zinc-200 hover:border-signal-blue/40"
          >
            npm CLI
          </Link>
          <Link
            href="https://github.com/Benjam16/Umbrella/blob/main/CAPABILITIES.md"
            className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-2 font-medium text-zinc-200 hover:border-signal-blue/40"
          >
            CAPABILITIES.md
          </Link>
        </div>
      </header>

      <main className="mx-auto mt-12 max-w-6xl px-4">
        {/* Hero row: 12 cols — terminal 7 + DAG 5 on large */}
        <section className="grid grid-cols-12 gap-4 lg:gap-5">
          <div className="col-span-12 lg:col-span-7">
            <HeroTerminal command={demoData.heroCommand} logs={demoData.heroLogs} />
            <p className="mt-3 font-mono text-[11px] text-zinc-600">
              Mission: {demoData.mission.title} — {demoData.mission.objective}
            </p>
          </div>
          <div className="col-span-12 lg:col-span-5">
            <ShadowDag nodes={demoData.dag.nodes} edges={demoData.dag.edges} />
          </div>
        </section>

        {/* Bento: 12-column grid */}
        <section className="mt-8 grid grid-cols-12 gap-4 lg:mt-10 lg:gap-5">
          <div className="col-span-12 min-h-[280px] md:col-span-6 lg:col-span-4">
            <SwarmOrchestrationTile />
          </div>
          <div className="col-span-12 min-h-[280px] md:col-span-6 lg:col-span-4">
            <SelfHealingTile
              fail={demoData.selfHealSnippet.fail}
              fix={demoData.selfHealSnippet.fix}
              pass={demoData.selfHealSnippet.pass}
            />
          </div>
          <div className="col-span-12 min-h-[320px] lg:col-span-4">
            <RiskPolicyWidget actions={demoData.toolActions} />
          </div>
          <div className="col-span-12 min-h-[260px]">
            <CeoBriefingTile text={demoData.ceoBriefing} />
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-zinc-800/60 bg-ink-900/40 p-6 text-sm text-zinc-500">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Deploy & integrate</h2>
          <p className="mt-2 max-w-3xl leading-relaxed">
            This folder is a self-contained <strong className="text-zinc-300">Next.js</strong> app. On Vercel, import the repo with{" "}
            <strong className="font-mono text-zinc-300">Root Directory = website</strong>. Optional: set{" "}
            <code className="font-mono text-signal-amber">NEXT_PUBLIC_UMBRELLA_API_URL</code> later and swap the footer fetch to your real{" "}
            <code className="font-mono text-signal-amber">/v1/health/dr</code> via a small server route.
          </p>
        </section>
      </main>

      <DrHealthBar />
    </div>
  );
}
