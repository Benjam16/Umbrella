import { seedMarketplace } from "@/lib/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/marketplace
 *
 * Returns the current snapshot of labor-backed agent tokens. When the
 * RelayerService + UmbrellaAgentToken contracts are live, this route will
 * read from Supabase (populated by the relayer as it anchors mission
 * outcomes on-chain) and merge in live v4 hook state read from Base.
 *
 * Until then: deterministic seed data that matches the production shape
 * 1:1, so the UI is final and only the data source changes.
 */
export async function GET() {
  const listings = seedMarketplace();
  return Response.json(
    { listings, updatedAt: Date.now() },
    {
      headers: {
        "Cache-Control": "public, max-age=10, s-maxage=30",
      },
    },
  );
}
