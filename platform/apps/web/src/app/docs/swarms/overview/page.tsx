import { DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function SwarmOverviewPage() {
  return (
    <DocPage
      eyebrow="Swarms"
      title="Swarm model"
      lead="Composable roles beat monolithic bots."
      next={{ href: "/docs/swarms/roles", label: "Agent roles" }}
    >
      <H2>Principles</H2>
      <UL>
        <li>Every mission is decomposed into roles rather than a single chain-of-thought.</li>
        <li>Roles have clear contracts and surface artifacts the next role can consume.</li>
        <li>Handoffs are logged and auditable.</li>
      </UL>

      <H2>Why swarms over bots</H2>
      <P>
        Single-bot execution hides state inside a transcript and gets worse as tasks
        compound. Swarms externalize state into the DAG, so failures are localizable and
        performance becomes compound rather than capped.
      </P>
    </DocPage>
  );
}
