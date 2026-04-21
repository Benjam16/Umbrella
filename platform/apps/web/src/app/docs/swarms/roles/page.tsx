import { DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function AgentRolesPage() {
  return (
    <DocPage
      eyebrow="Swarms"
      title="Agent roles"
      lead="The standard triad that covers most real missions."
      next={{ href: "/docs/swarms/valkyrie", label: "Valkyrie protocol" }}
    >
      <H2>Triage</H2>
      <P>
        Classifies incoming work, decides what kind of mission this is, and hands it to
        the right specialist. Triage is how we avoid jumping to execution prematurely.
      </P>

      <H2>Researcher</H2>
      <P>
        Gathers signal — on-chain state, off-chain documents, internal tool calls — and
        emits structured context for the executor to consume.
      </P>

      <H2>Executor</H2>
      <P>
        Acts on the researched context: calls tools, performs writes, or runs local
        commands via an ejected node. The DAG records every step.
      </P>

      <H2>Custom roles</H2>
      <UL>
        <li>Reviewer: sanity-check executor output before committing.</li>
        <li>Narrator: produce operator-facing summaries and briefings.</li>
        <li>Sentinel: monitor policy envelopes and block unsafe actions.</li>
      </UL>
    </DocPage>
  );
}
