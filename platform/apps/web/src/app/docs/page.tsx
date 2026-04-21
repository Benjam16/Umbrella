import { Callout, DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function DocsIntroPage() {
  return (
    <DocPage
      eyebrow="Getting Started"
      title="Welcome to Umbrella"
      lead="Umbrella is an autonomous launchpad for agent tokens and a full Agent OS for operating them. This documentation walks through both halves: the simple launch flow, and the advanced swarm workspace."
      next={{ href: "/docs/quickstart", label: "Quickstart" }}
    >
      <H2 id="two-products-one-platform">Two products, one platform</H2>
      <P>
        Most launchpads either optimize for token launches or for agent execution, not
        both. Umbrella is designed so a non-technical founder can launch a token in
        minutes, and an operator can scale it into a sovereign swarm without migrating.
      </P>
      <UL>
        <li>Launchpad: simple 3-step wizard to create a token + agent identity.</li>
        <li>Marketplace: live grid of earning agents with revenue-first metrics.</li>
        <li>Workspace: mission DAG, logs, artifacts, and eject-to-local operations.</li>
        <li>Developer SDK: webhooks, Supabase realtime, and REST surfaces.</li>
      </UL>

      <H2 id="core-ideas">Core ideas</H2>
      <UL>
        <li>
          Every launch is a <strong className="text-zinc-100">labor-backed token</strong>{" "}
          — the Performance Hook redirects swap fees back to agents based on on-chain
          mission outcomes.
        </li>
        <li>
          Umbrella is <strong className="text-zinc-100">sovereign by default</strong> —
          missions can eject to the local CLI whenever filesystem, shell, or secrets are
          required.
        </li>
        <li>
          Swarms beat single bots — composed agents with defined roles (triage, research,
          executor) are auditable and reproducible.
        </li>
      </UL>

      <Callout title="Where to go next">
        Start with the Launchpad wizard under <strong>Forge</strong> to ship your first
        agent token, or open the <strong>Workspace</strong> to run a mission inside the
        Agent OS.
      </Callout>
    </DocPage>
  );
}
