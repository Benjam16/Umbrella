import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../services/auth.js";
import { generalizeMissionForBlueprint } from "../services/blueprint-generalize.js";
import { listMissionBlueprints } from "../services/blueprints.js";
import { store } from "../store.js";

const categorySchema = z.enum(["shopping", "growth", "support", "crypto", "devops"]);

const mintBlueprintSchema = z.object({
  runId: z.string().min(6).max(120),
  name: z.string().min(2).max(120).optional(),
  description: z.string().min(8).max(2000).optional(),
  category: categorySchema.optional(),
  icon: z.string().min(1).max(32).optional(),
});

function extractFilenameHints(runId: string): string[] {
  const run = store.findRunById(runId);
  if (!run) return [];
  const hints = new Set<string>();
  for (const step of run.steps) {
    const text = step.lastOutput || "";
    const url = text.match(/navigate_and_extract:\s*(\S+)/i)?.[1];
    if (url) {
      const host = url
        .replace(/^https?:\/\//i, "")
        .split("/")[0]
        ?.replace(/[^a-zA-Z0-9.-]/g, "-");
      if (host) hints.add(`${host}-snapshot`);
    }
    const patched = [...text.matchAll(/patched:([^\s,]+)/g)].map((m) => m[1]).filter(Boolean);
    for (const p of patched) {
      const file = p.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "");
      if (file) hints.add(`${file}-update`);
    }
  }
  return [...hints].slice(0, 5);
}

export const blueprintsRoutes = new Hono();

blueprintsRoutes.get("/", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json({ blueprints: listMissionBlueprints(user.id) });
});

blueprintsRoutes.post("/mint", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = mintBlueprintSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);

  const run = store.findRunById(parsed.data.runId);
  if (!run || run.userId !== user.id) return c.json({ error: "not_found" }, 404);
  if (run.status !== "completed") return c.json({ error: "run_not_completed" }, 409);

  const generalized = await generalizeMissionForBlueprint(run.objective);

  const name =
    parsed.data.name?.trim() ||
    `${run.missionSource === "blueprint" ? "Minted" : "Custom"} · ${run.objective.slice(0, 48)}`;
  const MIN_DESCRIPTION_LENGTH = 8;
  const DEFAULT_DESCRIPTION = "Reusable blueprint minted from a completed mission.";
  const summaryFallback = run.outcomeSummary?.slice(0, 3).join(" ").trim() ?? "";
  const rawDescription =
    parsed.data.description?.trim() ||
    (summaryFallback.length >= MIN_DESCRIPTION_LENGTH ? summaryFallback : "") ||
    DEFAULT_DESCRIPTION;
  const description =
    rawDescription.length >= MIN_DESCRIPTION_LENGTH ? rawDescription : DEFAULT_DESCRIPTION;
  const category = parsed.data.category ?? "growth";

  const minted = store.createMintedBlueprint({
    userId: user.id,
    name,
    description,
    initialMission: generalized.mission,
    suggestedMaxCredits: Math.max(120, Math.min(900, run.creditsCharged * 2 || run.maxCredits || 200)),
    category,
    suggestedFilenames: extractFilenameHints(run.id),
    sourceRunId: run.id,
    icon: parsed.data.icon?.trim() || undefined,
    missionVariables:
      generalized.variableKeys.length > 0 ? generalized.variableKeys : undefined,
  });

  return c.json(
    {
      blueprint: minted,
      generalizedBy: generalized.generalizedBy,
    },
    201,
  );
});
