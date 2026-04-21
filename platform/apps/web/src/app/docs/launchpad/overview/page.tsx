import { DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function LaunchpadOverviewPage() {
  return (
    <DocPage
      eyebrow="Launchpad"
      title="Launchpad overview"
      lead="Umbrella's launchpad is engineered so that the easy path is also the right path."
      next={{ href: "/docs/launchpad/wizard", label: "3-step wizard" }}
    >
      <H2>Design goals</H2>
      <UL>
        <li>Non-technical first: no Solidity, no wallet rituals, no infra decisions.</li>
        <li>Revenue by default: fees flow through the Performance Hook out of the box.</li>
        <li>Composable downstream: once launched, the agent plugs into the workspace.</li>
      </UL>

      <H2>Under the hood</H2>
      <P>
        When you complete the wizard, Umbrella verifies payment to the treasury,
        requests Solidity from the Kimi pipeline, stores artifacts in Supabase, and
        registers pool metadata so the Performance Hook can route fees correctly.
      </P>

      <H2>What gets produced</H2>
      <UL>
        <li>Agent token identity (name, symbol, branding).</li>
        <li>Mission specification.</li>
        <li>Generated hook artifacts (Solidity).</li>
        <li>Marketplace listing metadata.</li>
      </UL>
    </DocPage>
  );
}
