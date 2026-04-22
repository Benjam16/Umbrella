import { NextResponse } from "next/server";
import { countForks } from "@/lib/forge-hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/forge/hooks/:id/forks
 *
 * Number of rows whose `forked_from` points at :id. Safe to expose publicly
 * — it leaks no fork content, only the count. Used by the creator's
 * workspace card and the marketplace profile page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !/^[0-9a-fA-F-]{10,}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const count = await countForks(id);
    return NextResponse.json({ count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to count forks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
