import { completeOpenAIChat } from "./inference.js";
import { loadModelRegistry } from "./models.js";

/** Collect ordered unique `{{NAME}}` keys from a mission template. */
export function extractVariableKeysFromMission(mission: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const re = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mission)) !== null) {
    const k = m[1];
    if (!seen.has(k)) {
      seen.add(k);
      ordered.push(k);
    }
  }
  return ordered;
}

function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return raw.trim();
}

/** Replace concrete URLs, long hex, emails with coarse placeholders when model is unavailable. */
export function heuristicGeneralizeMission(objective: string): { mission: string; variableKeys: string[] } {
  let mission = objective;
  const keys: string[] = [];

  const add = (name: string) => {
    if (!keys.includes(name)) keys.push(name);
  };

  mission = mission.replace(/\bhttps?:\/\/[^\s)]+/gi, () => {
    add("TARGET_URL");
    return "{{TARGET_URL}}";
  });
  mission = mission.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, () => {
    add("CONTACT_EMAIL");
    return "{{CONTACT_EMAIL}}";
  });
  mission = mission.replace(/\b0x[a-fA-F0-9]{40}\b/g, () => {
    add("WALLET_ADDRESS");
    return "{{WALLET_ADDRESS}}";
  });
  mission = mission.replace(/(?:discord\.(?:gg|com)\/[^\s)]+|discord\.com\/invite\/[^\s)]+)/gi, () => {
    add("DISCORD_INVITE");
    return "{{DISCORD_INVITE}}";
  });
  mission = mission.replace(/@[A-Za-z0-9_]{2,32}\b/g, () => {
    add("SOCIAL_HANDLE");
    return "{{SOCIAL_HANDLE}}";
  });

  return { mission: mission.trim(), variableKeys: keys };
}

/**
 * Uses the configured default chat model to turn a one-off mission into a reusable template
 * with `{{SNAKE_CASE}}` placeholders. Falls back to heuristics on failure or stub provider.
 */
export async function generalizeMissionForBlueprint(objective: string): Promise<{
  mission: string;
  variableKeys: string[];
  generalizedBy: "model" | "heuristic";
}> {
  const registry = loadModelRegistry();
  const model = registry.byId.get(registry.defaultModelId);
  if (!model || model.provider === "stub" || !model.baseUrl) {
    const h = heuristicGeneralizeMission(objective);
    return { ...h, generalizedBy: "heuristic" };
  }

  const system = `You generalize user missions into reusable automation templates.

Rules:
- Replace specific URLs, invite links, emails, wallet addresses, Discord URLs, and social handles with placeholders {{UPPER_SNAKE_CASE}}.
- Keep steps and intent clear for another operator who will fill in values later.
- Output ONLY valid JSON: {"mission":"string","variableKeys":["KEY_ONE","KEY_TWO"],"notes":"optional"}`;

  try {
    const res = await completeOpenAIChat(
      {
        baseUrl: model.baseUrl,
        model: model.model,
        apiKey: model.apiKey,
      },
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `Mission to generalize:\n\n${objective}`,
        },
      ],
    );
    const raw = extractJsonObject(res.content);
    const parsed = JSON.parse(raw) as {
      mission?: string;
      variableKeys?: string[];
    };
    const mission = typeof parsed.mission === "string" ? parsed.mission.trim() : "";
    const variableKeysRaw = Array.isArray(parsed.variableKeys) ? parsed.variableKeys : [];
    const normalizeKey = (raw: string): string =>
      raw
        .trim()
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
    const variableKeys = variableKeysRaw
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => normalizeKey(k))
      .filter((k) => k.length > 0);

    if (mission.length < 12) {
      const h = heuristicGeneralizeMission(objective);
      return { ...h, generalizedBy: "heuristic" };
    }

    const fromMission = extractVariableKeysFromMission(mission);
    const merged = [...new Set([...variableKeys, ...fromMission])];
    return { mission, variableKeys: merged, generalizedBy: "model" };
  } catch {
    const h = heuristicGeneralizeMission(objective);
    return { ...h, generalizedBy: "heuristic" };
  }
}
