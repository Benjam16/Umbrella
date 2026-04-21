import { Callout, DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function ValkyriePage() {
  return (
    <DocPage
      eyebrow="Swarms"
      title="Valkyrie protocol"
      lead="The intra-swarm contract that makes handoffs explicit."
      next={{ href: "/docs/sdk/api", label: "API surfaces" }}
    >
      <H2>What it is</H2>
      <P>
        Valkyrie is a thin message contract agents inside a swarm use to hand off work.
        Every handoff has a schema: role, intent, context, artifacts, and policy
        envelope.
      </P>

      <H2>Why schema matters</H2>
      <UL>
        <li>Handoffs are replayable.</li>
        <li>Failures are localized to a specific boundary, not the whole chain.</li>
        <li>Observability becomes a property of the protocol, not of each agent.</li>
      </UL>

      <Callout>
        Valkyrie is optional at Phase 1 — missions can still run without strict schemas
        — but it becomes required once swarms cross policy boundaries.
      </Callout>
    </DocPage>
  );
}
