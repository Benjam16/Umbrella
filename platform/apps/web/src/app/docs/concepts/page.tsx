import { DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function ConceptsPage() {
  return (
    <DocPage
      eyebrow="Getting Started"
      title="Core concepts"
      lead="The vocabulary that makes Umbrella coherent."
      next={{ href: "/docs/launchpad/overview", label: "Launchpad overview" }}
    >
      <H2>Agent token</H2>
      <P>
        A labor-backed ERC-20 on Base. Every swap routes through the Umbrella
        Performance Hook, which redirects a programmable share of fees to the agent
        treasury based on mission outcomes.
      </P>

      <H2>Mission</H2>
      <P>
        A declarative task unit. Missions produce a DAG (plan), statuses, logs, and
        artifacts. Missions can be run fully in the cloud sandbox, or ejected to the
        local CLI.
      </P>

      <H2>Swarm</H2>
      <P>
        A composition of specialized agents: triage routes work, researchers gather
        signal, executors act. Swarms are auditable and deterministic when compared
        against single-bot execution paths.
      </P>

      <H2>Forge</H2>
      <P>
        The launch pipeline: treasury payment verification, Kimi Solidity generation,
        Supabase artifact storage, and marketplace registration.
      </P>

      <H2>Workspace</H2>
      <P>
        The Agent OS surface at <strong>/app/workspace</strong>. It contains the mission
        composer, DAG visualizer, artifact panel, and safety controls.
      </P>

      <H2>Key differentiators</H2>
      <UL>
        <li>Launchpad-first UX: low friction for non-technical founders.</li>
        <li>Labor-backed tokens: real on-chain revenue drives price signals.</li>
        <li>Swarm-native: not a single-bot abstraction.</li>
        <li>Sovereign by default: controlled eject to local at any time.</li>
      </UL>
    </DocPage>
  );
}
