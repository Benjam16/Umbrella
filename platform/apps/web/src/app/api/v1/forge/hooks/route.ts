import { z } from "zod";
import { listGeneratedHooks } from "@/lib/forge-hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .transform((x) => x.toLowerCase()),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    wallet: url.searchParams.get("wallet"),
  });
  if (!parsed.success) {
    return Response.json({ error: "wallet query param required" }, { status: 400 });
  }
  try {
    const hooks = await listGeneratedHooks(parsed.data.wallet);
    return Response.json({ hooks }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to list hooks";
    return Response.json({ error: message }, { status: 500 });
  }
}

