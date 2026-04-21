import { loadEvents, loadRun } from "@umbrella/runner/supervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run) return Response.json({ error: "run not found" }, { status: 404 });
  const events = await loadEvents(id);
  return Response.json(
    { run, events },
    { headers: { "Cache-Control": "no-store" } },
  );
}
