import { DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function WorkspaceDocPage() {
  return (
    <DocPage
      eyebrow="Agent OS"
      title="Workspace"
      lead="The dense execution surface for operators."
      next={{ href: "/docs/os/missions", label: "Missions & DAG" }}
    >
      <H2>Where it lives</H2>
      <P>
        The workspace route is <strong>/app/workspace</strong>. It hosts the mission
        composer, DAG visualization, run artifacts, and safety controls.
      </P>

      <H2>What you can do</H2>
      <UL>
        <li>Compose and start a mission against any available blueprint.</li>
        <li>Watch the plan expand live as the supervisor decomposes work.</li>
        <li>Inspect logs, artifacts, and summaries in a side panel.</li>
        <li>Eject to local CLI when missions require sovereign execution.</li>
      </UL>
    </DocPage>
  );
}
