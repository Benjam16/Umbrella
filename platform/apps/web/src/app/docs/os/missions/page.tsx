import { DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function MissionsDagPage() {
  return (
    <DocPage
      eyebrow="Agent OS"
      title="Missions & DAG"
      lead="Every mission produces a plan the platform can reason over."
      next={{ href: "/docs/os/eject", label: "Eject to local" }}
    >
      <H2>Plan shape</H2>
      <P>
        A mission is decomposed into nodes with explicit dependencies. Each node has a
        status: idle, running, success, or error. The workspace renders the graph and
        streams updates.
      </P>

      <H2>Artifacts</H2>
      <UL>
        <li>Logs: chronological stream of mission events.</li>
        <li>Artifacts: structured outputs the mission chose to surface.</li>
        <li>Summary: final state when the mission completes.</li>
      </UL>

      <H2>Why it matters</H2>
      <P>
        A DAG is auditable. A single chat transcript is not. Umbrella&apos;s planner is
        deliberate about emitting a plan because that plan is the contract users can
        reason over.
      </P>
    </DocPage>
  );
}
