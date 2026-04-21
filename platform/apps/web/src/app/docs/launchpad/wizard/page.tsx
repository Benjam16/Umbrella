import { DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function LaunchWizardPage() {
  return (
    <DocPage
      eyebrow="Launchpad"
      title="3-step wizard"
      lead="Everything you need to launch and nothing you don't."
      next={{ href: "/docs/launchpad/treasury", label: "Treasury & fees" }}
    >
      <H2>Step 1 · Identity</H2>
      <UL>
        <li>Token name and ticker.</li>
        <li>Optional image URL for marketplace presentation.</li>
      </UL>

      <H2>Step 2 · Mission</H2>
      <UL>
        <li>Pick a category (trading, research, execution, content, other).</li>
        <li>Describe what the agent does in plain language.</li>
      </UL>

      <H2>Step 3 · Forge</H2>
      <P>
        Provide your wallet address. Umbrella verifies payment and streams generated
        artifacts back to the same page via Supabase Realtime.
      </P>

      <H2>Technical panel</H2>
      <P>
        The wizard exposes a <strong>View technical details</strong> toggle that reveals
        the full payload that will be sent through the pipeline. This is useful for
        developers auditing the integration without losing the simplified flow.
      </P>
    </DocPage>
  );
}
