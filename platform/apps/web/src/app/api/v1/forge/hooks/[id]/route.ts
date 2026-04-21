import { z } from "zod";
import { setHookPublic } from "@/lib/forge-hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .transform((x) => x.toLowerCase()),
  isPublic: z.boolean(),
});

const idSchema = z
  .string()
  .regex(/^[0-9a-fA-F-]{16,}$/, "hook id must be a uuid-like string");

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "invalid hook id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "walletAddress and isPublic are required" },
      { status: 400 },
    );
  }

  try {
    const row = await setHookPublic({
      hookId: parsedId.data,
      walletAddress: parsed.data.walletAddress,
      isPublic: parsed.data.isPublic,
    });
    return Response.json({ hook: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "visibility update failed";
    const status = /not found|does not own/i.test(message) ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
