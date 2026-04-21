import { Callout, DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function EjectPage() {
  return (
    <DocPage
      eyebrow="Agent OS"
      title="Eject to local"
      lead="Sovereignty is a feature, not a fallback."
      next={{ href: "/docs/swarms/overview", label: "Swarm model" }}
    >
      <H2>When eject fires</H2>
      <UL>
        <li>Mission requests filesystem access the sandbox does not grant.</li>
        <li>Mission requires shell execution or local secrets.</li>
        <li>Operator explicitly elects to move execution to the local CLI.</li>
      </UL>

      <H2>How it feels</H2>
      <P>
        The workspace surfaces an Eject affordance with the specific reason and the
        blocking nodes. Accepting transitions execution to the local node cleanly.
      </P>

      <Callout tone="warn" title="Safety posture">
        Eject is explicit by design. Umbrella never escalates privileges silently — any
        move from cloud to local requires operator intent.
      </Callout>
    </DocPage>
  );
}
