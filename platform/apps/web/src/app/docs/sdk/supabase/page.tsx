import { Code, DocPage, H2, P, UL } from "@/components/docs/DocPage";

export default function SupabaseDocPage() {
  return (
    <DocPage
      eyebrow="Developer SDK"
      title="Supabase integration"
      lead="How Umbrella persists launch artifacts and streams them to the UI."
    >
      <H2>Why Supabase</H2>
      <P>
        Supabase gives us Postgres + Realtime + Auth in a single BaaS. The Forge stores
        generated artifacts there and the browser subscribes to changes via
        Supabase Realtime.
      </P>

      <H2>Table shape</H2>
      <UL>
        <li>
          <Code>generated_hooks</Code> — rows keyed by wallet with fields:
          <Code>wallet_address</Code>, <Code>tx_hash</Code>, <Code>chain_id</Code>,{" "}
          <Code>prompt</Code>, <Code>solidity_code</Code>, <Code>model</Code>,{" "}
          <Code>status</Code>, <Code>created_at</Code>.
        </li>
      </UL>

      <H2>Client access</H2>
      <P>
        The browser uses a read-only client via <Code>NEXT_PUBLIC_SUPABASE_URL</Code>{" "}
        and <Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code>. Server-side paths use the
        service-role key, which stays on Vercel.
      </P>

      <H2>Realtime</H2>
      <P>
        The Forge page subscribes to <Code>postgres_changes</Code> on the{" "}
        <Code>generated_hooks</Code> table, filtered by wallet, so new artifacts appear
        live without polling.
      </P>
    </DocPage>
  );
}
