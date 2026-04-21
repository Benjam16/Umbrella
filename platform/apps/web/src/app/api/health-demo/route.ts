export const runtime = "edge";

/**
 * Demo DR-style payload for the marketing site. Point a real deployment at
 * `NEXT_PUBLIC_UMBRELLA_API_URL` and call `/v1/health/dr` from a server route instead.
 */
export async function GET() {
  const now = new Date().toISOString();
  return Response.json(
    {
      status: "healthy",
      integrity: "ok",
      lastSnapshotIso: now,
      source: "edge-demo",
      hint: "Mirrors GET /v1/health/dr shape for trust UX; wire production API when ready.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
