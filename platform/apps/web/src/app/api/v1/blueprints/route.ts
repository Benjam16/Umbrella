import { blueprints } from "@umbrella/runner/blueprints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      blueprints: blueprints.map((b) => ({
        id: b.id,
        title: b.title,
        tagline: b.tagline,
        description: b.description,
        sampleGoal: b.sampleGoal,
        estimatedSeconds: b.estimatedSeconds,
        maxRisk: b.maxRisk,
        inputs: b.inputs,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
