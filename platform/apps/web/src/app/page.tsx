import { ArchitectureStack } from "@/components/ArchitectureStack";
import { CapabilitiesGrid } from "@/components/CapabilitiesGrid";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { CeoBriefingTile } from "@/components/CeoBriefingTile";
import { DrHealthBar } from "@/components/DrHealthBar";
import { FaqAccordion } from "@/components/FaqAccordion";
import { HeroTerminal } from "@/components/HeroTerminal";
import { PlaygroundSection } from "@/components/PlaygroundSection";
import { Reveal } from "@/components/Reveal";
import { RiskPolicyWidget } from "@/components/RiskPolicyWidget";
import { RoadmapTimeline } from "@/components/RoadmapTimeline";
import { SectionHeading } from "@/components/SectionHeading";
import { SelfHealingTile } from "@/components/SelfHealingTile";
import { ShadowDag } from "@/components/ShadowDag";
import { StatsTicker } from "@/components/StatsTicker";
import { SwarmOrchestrationTile } from "@/components/SwarmOrchestrationTile";
import { demoData } from "@/lib/demo-data";
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative min-h-screen pb-40">
      {/* Hero watermark — the umbrella girl, inverted into the dark ink. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-80px] top-[-60px] z-0 h-[640px] w-[640px] opacity-[0.085] mix-blend-luminosity animate-ink-float md:h-[760px] md:w-[760px]"
      >
        <Image
          src="/umbrella-logo.png"
          alt=""
          fill
          priority
          sizes="(min-width: 768px) 760px, 640px"
          className="object-contain invert"
        />
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[70vh] hero-haze" />

      <header className="relative z-10 mx-auto max-w-6xl px-4 pt-10 sm:pt-14">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <span className="text-signal-blue">☂</span>
            <span>Umbrella</span>
          </Link>
          <nav className="flex items-center gap-3 text-xs">
            <Link href="/app" className="text-zinc-300 hover:text-signal-blue">
              Launchpad
            </Link>
            <Link href="/app/marketplace" className="text-zinc-300 hover:text-signal-blue">
              Marketplace
            </Link>
            <Link href="/docs" className="text-zinc-300 hover:text-signal-blue">
              Docs
            </Link>
            <ConnectWalletButton />
          </nav>
        </div>
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal-sepia">
            Umbrella · Autonomous Launchpad
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">
            Launch tokens, deploy swarms, and run your{" "}
            <span className="ink-accent text-signal-sepia">agent workforce</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            Umbrella combines a non-technical launch flow with a high-density Agent OS.
            Start with guided token + agent launch, then drop into the workspace for live
            DAG control, mission telemetry, and swarm orchestration.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <Link
              href="/app"
              className="rounded-xl bg-signal-blue px-5 py-2.5 font-semibold text-ink-950 shadow-lg shadow-signal-blue/20 transition hover:bg-signal-blue/90"
            >
              Open launchpad →
            </Link>
            <Link
              href="/app/marketplace"
              className="rounded-xl border border-signal-blue/40 bg-signal-blue/10 px-5 py-2.5 font-medium text-signal-blue backdrop-blur-sm hover:border-signal-blue"
            >
              Explore marketplace
            </Link>
            <Link
              href="/docs"
              className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-5 py-2.5 font-medium text-zinc-200 backdrop-blur-sm hover:border-signal-blue/40"
            >
              Docs
            </Link>
            <Link
              href="https://github.com/Benjam16/Umbrella"
              className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-5 py-2.5 font-medium text-zinc-200 backdrop-blur-sm hover:border-signal-blue/40"
            >
              GitHub
            </Link>
            <Link
              href="https://www.npmjs.com/package/@benjam16/umbrella"
              className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-5 py-2.5 font-medium text-zinc-200 backdrop-blur-sm hover:border-signal-blue/40"
            >
              npm CLI
            </Link>
            <Link
              href="https://github.com/Benjam16/Umbrella/blob/main/CAPABILITIES.md"
              className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-5 py-2.5 font-medium text-zinc-200 backdrop-blur-sm hover:border-signal-blue/40"
            >
              CAPABILITIES.md
            </Link>
          </div>
          <p className="ink-accent mt-6 text-xl text-signal-sepia/80">
            — drawn in ink, shipped in code.
          </p>
        </Reveal>
      </header>

      <main className="relative z-10 mx-auto mt-14 max-w-6xl px-4">
        <section className="rounded-2xl border border-zinc-800/60 bg-ink-900/40 p-6">
          <Reveal>
            <SectionHeading
              eyebrow="launchpad"
              title={
                <>
                  Built for non-technical founders and{" "}
                  <span className="ink-accent text-signal-sepia">advanced operators</span>
                </>
              }
              subtitle="Use the 3-step launch flow for token + agent creation, then switch into Workspace for detailed swarm control and run operations."
            />
          </Reveal>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-ink-950/50 p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
                Step 1
              </p>
              <h3 className="mt-1 text-sm font-semibold text-zinc-100">Token Identity</h3>
              <p className="mt-2 text-xs text-zinc-400">
                Choose name, symbol, and branding in a guided wizard.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-ink-950/50 p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
                Step 2
              </p>
              <h3 className="mt-1 text-sm font-semibold text-zinc-100">Agent Mission</h3>
              <p className="mt-2 text-xs text-zinc-400">
                Describe what your agent does in plain language.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-ink-950/50 p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
                Step 3
              </p>
              <h3 className="mt-1 text-sm font-semibold text-zinc-100">Forge & Launch</h3>
              <p className="mt-2 text-xs text-zinc-400">
                Deploy through Umbrella pipeline and route to the marketplace.
              </p>
            </div>
          </div>
        </section>

        {/* Workspace row (moved lower in hierarchy) */}
        <section className="grid grid-cols-12 gap-4 lg:gap-5">
          <Reveal className="col-span-12 lg:col-span-7">
            <HeroTerminal command={demoData.heroCommand} logs={demoData.heroLogs} />
            <p className="mt-3 font-mono text-[11px] text-zinc-600">
              Mission: {demoData.mission.title} — {demoData.mission.objective}
            </p>
          </Reveal>
          <Reveal className="col-span-12 lg:col-span-5">
            <ShadowDag nodes={demoData.dag.nodes} edges={demoData.dag.edges} />
          </Reveal>
        </section>

        {/* Stats strip */}
        <section className="mt-10">
          <Reveal>
            <StatsTicker />
          </Reveal>
        </section>

        {/* Bento */}
        <section className="mt-20 grid grid-cols-12 gap-4 lg:gap-5">
          <Reveal className="col-span-12 min-h-[280px] md:col-span-6 lg:col-span-4">
            <SwarmOrchestrationTile />
          </Reveal>
          <Reveal className="col-span-12 min-h-[280px] md:col-span-6 lg:col-span-4">
            <SelfHealingTile
              fail={demoData.selfHealSnippet.fail}
              fix={demoData.selfHealSnippet.fix}
              pass={demoData.selfHealSnippet.pass}
            />
          </Reveal>
          <Reveal className="col-span-12 min-h-[320px] lg:col-span-4">
            <RiskPolicyWidget actions={demoData.toolActions} />
          </Reveal>
          <Reveal className="col-span-12 min-h-[260px]">
            <CeoBriefingTile text={demoData.ceoBriefing} />
          </Reveal>
        </section>

        {/* Playground */}
        <section id="playground" className="mt-28 scroll-mt-16">
          <Reveal>
            <SectionHeading
              eyebrow="try it"
              title={
                <>
                  Run tests inside the <span className="ink-accent text-signal-sepia">playground</span>
                </>
              }
              subtitle={
                <>
                  A sandboxed CLI right on the page — no network, no filesystem. Type{" "}
                  <code className="font-mono text-signal-amber">help</code> to list commands,
                  or jump straight in with{" "}
                  <code className="font-mono text-signal-amber">
                    umbrella plan &quot;audit my repo&quot;
                  </code>
                  .
                </>
              }
            />
          </Reveal>

          <PlaygroundSection />
        </section>

        {/* Capabilities */}
        <section className="mt-28">
          <Reveal>
            <SectionHeading
              eyebrow="capabilities"
              title={
                <>
                  What the agent <span className="ink-accent text-signal-sepia">actually does</span>
                </>
              }
              subtitle="Each tile is a live subsystem on the desktop side — planner, auditor, policy, DR. This is the mental model, not a slogan."
            />
          </Reveal>
          <div className="mt-10">
            <CapabilitiesGrid items={demoData.capabilities} />
          </div>
        </section>

        {/* Architecture */}
        <section className="mt-28">
          <Reveal>
            <SectionHeading
              eyebrow="architecture"
              title={
                <>
                  Four layers. Your <span className="ink-accent text-signal-sepia">signature</span> is the only escape hatch.
                </>
              }
              subtitle="Desktop shell talks to a credit-metered API, which talks to hosted inference and a pluggable settlement lane. Policy and DR live on the API."
            />
          </Reveal>
          <div className="mt-10">
            <Reveal>
              <ArchitectureStack layers={demoData.architecture} />
            </Reveal>
          </div>
        </section>

        {/* Roadmap */}
        <section className="mt-28">
          <Reveal>
            <SectionHeading
              eyebrow="roadmap"
              title={
                <>
                  From desktop to <span className="ink-accent text-signal-sepia">sovereign swarm</span>
                </>
              }
              subtitle="Three phases. Each one ships a complete product — no dead ends, no migrations that leave early users behind."
            />
          </Reveal>
          <div className="mt-10">
            <RoadmapTimeline stages={demoData.roadmap} />
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-28">
          <Reveal>
            <SectionHeading
              eyebrow="faq"
              title={
                <>
                  Questions <span className="ink-accent text-signal-sepia">worth asking</span>
                </>
              }
              subtitle="Direct answers. No hype cycle."
            />
          </Reveal>
          <div className="mt-10">
            <Reveal>
              <FaqAccordion items={demoData.faq} />
            </Reveal>
          </div>
        </section>

        {/* Closing signature + deploy notes */}
        <section className="relative mt-28 overflow-hidden rounded-2xl border border-zinc-800/60 bg-ink-900/40 p-8 text-sm text-zinc-500">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 opacity-[0.07] mix-blend-luminosity"
          >
            <Image
              src="/umbrella-logo.png"
              alt=""
              fill
              sizes="224px"
              className="object-contain invert"
            />
          </div>
          <Reveal>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Deploy & integrate
            </h2>
            <p className="mt-2 max-w-3xl leading-relaxed">
              This folder is a self-contained <strong className="text-zinc-300">Next.js</strong>{" "}
              app. On Vercel, import the repo with{" "}
              <strong className="font-mono text-zinc-300">Root Directory = website</strong>.
              Optional: set{" "}
              <code className="font-mono text-signal-amber">NEXT_PUBLIC_UMBRELLA_API_URL</code>{" "}
              later and swap the footer fetch to your real{" "}
              <code className="font-mono text-signal-amber">/v1/health/dr</code> via a small
              server route.
            </p>
            <p className="ink-accent mt-6 text-2xl text-signal-sepia/80">
              stay dry. ship anyway.
            </p>
          </Reveal>
        </section>
      </main>

      <DrHealthBar />
    </div>
  );
}
