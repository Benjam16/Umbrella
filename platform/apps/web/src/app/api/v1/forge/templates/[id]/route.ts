import { NextResponse } from "next/server";
import { getPublicHookById } from "@/lib/forge-hooks";

/**
 * Public template fetch used by the Marketplace → Forge "fork this agent"
 * flow. Intentionally returns a minimal shape — no Solidity source, no
 * transaction hash — just enough for the wizard to seed a new launch:
 *   - prompt   → Mission step 2
 *   - model    → informational only (shown as a context banner)
 *   - id       → so the wizard can tag the new launch as a fork.
 *
 * Rows that are not `is_public = true` return 404 to avoid leaking the
 * existence of private generations.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !/^[0-9a-fA-F-]{10,}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const row = await getPublicHookById(id);
    if (!row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({
      template: {
        id: row.id,
        prompt: row.prompt ?? "",
        model: row.model,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to load template" },
      { status: 500 },
    );
  }
}
