import { ArchitectureStack } from "@/components/ArchitectureStack";
import { CapabilitiesGrid } from "@/components/CapabilitiesGrid";
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
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal-sepia">
            Umbrella · Agentic OS
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">
            An agent that <span className="ink-accent text-signal-sepia">stays dry</span> in
            the rain.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            Umbrella is a sovereign desktop runner: a{" "}
            <span className="text-zinc-200">simulated planner</span>, a{" "}
            <span className="text-zinc-200">shadow DAG</span>, a{" "}
            <span className="text-zinc-200">live playground terminal</span>, and
            policy-gated <span className="text-zinc-200">DR snapshots</span> — drawn with
            ink, wired like a HUD.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <Link
              href="/app"
              className="rounded-xl bg-signal-blue px-5 py-2.5 font-semibold text-ink-950 shadow-lg shadow-signal-blue/20 transition hover:bg-signal-blue/90"
            >
              Open workspace →
            </Link>
            <Link
              href="#playground"
              className="rounded-xl border border-signal-blue/40 bg-signal-blue/10 px-5 py-2.5 font-medium text-signal-blue backdrop-blur-sm hover:border-signal-blue"
            >
              Sandbox demo ↓
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
        {/* Hero row */}
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
