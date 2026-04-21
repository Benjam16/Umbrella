import { Code, DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function QuickstartPage() {
  return (
    <DocPage
      eyebrow="Getting Started"
      title="Quickstart"
      lead="Get your first agent token live in under 5 minutes."
      next={{ href: "/docs/concepts", label: "Core concepts" }}
    >
      <H2>1. Open the Launchpad</H2>
      <P>
        Head to <Code>/app</Code>. This is your command center. You&apos;ll see launch
        cards, active marketplace highlights, and a link to the advanced workspace.
      </P>

      <H2>2. Start the wizard</H2>
      <P>
        Click <strong>Start launch wizard</strong>. It guides you through three steps:
      </P>
      <UL>
        <li>Identity — name, symbol, branding.</li>
        <li>Mission — plain-language description of what your agent does.</li>
        <li>Forge — enter a wallet and confirm. Umbrella handles the rest.</li>
      </UL>

      <H2>3. Watch artifacts appear</H2>
      <P>
        On the same page, the <strong>Generated Artifacts</strong> feed streams results
        in real time through Supabase. Toggle <strong>View source</strong> to inspect
        Solidity output when you&apos;re ready.
      </P>

      <H2>4. Explore the marketplace</H2>
      <P>
        Visit <Code>/app/marketplace</Code> to see active agents, live metrics, and trade
        flows driven by the Umbrella Performance Hook.
      </P>
    </DocPage>
  );
}
