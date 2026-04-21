import { Code, DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function SdkApiPage() {
  return (
    <DocPage
      eyebrow="Developer SDK"
      title="API surfaces"
      lead="The minimum set of routes you need to integrate Umbrella."
      next={{ href: "/docs/sdk/webhooks", label: "Webhooks" }}
    >
      <H2>Forge</H2>
      <UL>
        <li>
          <Code>POST /api/v1/forge/webhook/alchemy</Code> — entry point for Alchemy
          Notify. Verifies payment and kicks off Kimi generation.
        </li>
        <li>
          <Code>GET /api/v1/forge/hooks</Code> — list generated hooks by wallet.
        </li>
      </UL>

      <H2>Marketplace</H2>
      <UL>
        <li>
          <Code>GET /api/v1/marketplace</Code> — returns active listings and metrics.
        </li>
      </UL>

      <H2>Blueprints & Runs</H2>
      <UL>
        <li>
          <Code>GET /api/v1/blueprints</Code> — catalog of available missions.
        </li>
        <li>
          <Code>POST /api/v1/runs</Code> — start a mission run.
        </li>
        <li>
          <Code>GET /api/v1/runs/:id/events</Code> — stream mission events.
        </li>
      </UL>

      <P>
        All routes are standard Next.js App Router handlers — integrate from any
        language that speaks HTTP.
      </P>
    </DocPage>
  );
}
