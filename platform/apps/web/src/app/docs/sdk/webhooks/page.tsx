import { Callout, Code, DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function WebhooksPage() {
  return (
    <DocPage
      eyebrow="Developer SDK"
      title="Webhooks"
      lead="Alchemy Notify is the launch trigger."
      next={{ href: "/docs/sdk/supabase", label: "Supabase integration" }}
    >
      <H2>Endpoint</H2>
      <P>
        Point Alchemy Notify at <Code>/api/v1/forge/webhook/alchemy</Code>. Umbrella
        validates the HMAC signature, verifies the on-chain payment, and enqueues the
        generation job.
      </P>

      <H2>Environment</H2>
      <UL>
        <li>
          <Code>ALCHEMY_WEBHOOK_SIGNING_KEY</Code>
        </li>
        <li>
          <Code>BASE_RPC_URL</Code>
        </li>
        <li>
          <Code>TREASURY_ADDRESS</Code>
        </li>
        <li>
          <Code>UMBRELLA_FORGE_MIN_PAYMENT_WEI</Code>
        </li>
        <li>
          <Code>KIMI_API_KEY</Code>, <Code>KIMI_BASE_URL</Code>, <Code>KIMI_MODEL</Code>
        </li>
      </UL>

      <Callout tone="warn" title="Security">
        Never expose service-role Supabase keys or Kimi keys on the client. Use Vercel
        server environment variables and rotate any keys accidentally shared.
      </Callout>
    </DocPage>
  );
}
