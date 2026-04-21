import { Callout, Code, DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function TreasuryPage() {
  return (
    <DocPage
      eyebrow="Launchpad"
      title="Treasury & fees"
      lead="How Umbrella handles platform payments and creator revenue."
      next={{ href: "/docs/os/workspace", label: "Workspace" }}
    >
      <H2>Treasury flow</H2>
      <P>
        Launches require a small payment to the Umbrella treasury. The webhook verifies
        transaction success, recipient, and minimum value before proceeding.
      </P>
      <UL>
        <li>
          Minimum payment env: <Code>UMBRELLA_FORGE_MIN_PAYMENT_WEI</Code>
        </li>
        <li>
          Treasury address env: <Code>TREASURY_ADDRESS</Code>
        </li>
        <li>
          Base RPC env: <Code>BASE_RPC_URL</Code>
        </li>
      </UL>

      <H2>Creator revenue</H2>
      <P>
        Pools are initialized so the Performance Hook can split swap fees between the
        Umbrella treasury and the creator address. Defaults route 100% to the treasury
        if no creator is registered.
      </P>

      <Callout title="Operational note">
        Rotate any keys exposed during configuration and align your Supabase schema with
        the latest code before launching in production.
      </Callout>
    </DocPage>
  );
}
