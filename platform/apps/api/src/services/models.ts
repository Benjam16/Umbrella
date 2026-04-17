export type ModelProvider = "openai" | "stub";

export type ModelConfig = {
  id: string;
  label: string;
  provider: ModelProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  costPer1k: number;
  enabled: boolean;
};

export type ModelRegistry = {
  byId: Map<string, ModelConfig>;
  defaultModelId: string;
  list: ModelConfig[];
};

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeId(raw: string): string {
  return raw.trim().toLowerCase();
}

function toKeyId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, "_").toUpperCase();
}

function modelFromEnv(id: string): ModelConfig | null {
  const key = toKeyId(id);
  const enabled = process.env[`UMBRELLA_MODEL_${key}_ENABLED`] === "true";
  if (!enabled) return null;

  const providerRaw = (process.env[`UMBRELLA_MODEL_${key}_PROVIDER`] ?? "openai")
    .trim()
    .toLowerCase();
  const provider: ModelProvider =
    providerRaw === "stub" ? "stub" : "openai";
  const model = process.env[`UMBRELLA_MODEL_${key}_NAME`] ?? id;
  const baseUrl = process.env[`UMBRELLA_MODEL_${key}_BASE_URL`]?.replace(/\/$/, "");
  const apiKey = process.env[`UMBRELLA_MODEL_${key}_API_KEY`]?.trim();
  const label = process.env[`UMBRELLA_MODEL_${key}_LABEL`] ?? id;
  const costPer1k = Math.max(
    1,
    envInt(`UMBRELLA_MODEL_${key}_CREDITS_PER_1K`, 5),
  );

  return {
    id,
    label,
    provider,
    model,
    baseUrl,
    apiKey,
    costPer1k,
    enabled,
  };
}

function defaultGemmaModel(): ModelConfig | null {
  const baseUrl = process.env.UMBRELLA_INFERENCE_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;
  return {
    id: "gemma",
    label: "Gemma (default)",
    provider: "openai",
    model: process.env.UMBRELLA_INFERENCE_MODEL ?? "gemma3:4b",
    baseUrl,
    apiKey: process.env.UMBRELLA_INFERENCE_API_KEY?.trim(),
    costPer1k: Math.max(
      1,
      envInt("UMBRELLA_CREDIT_COST_PER_1K_TOKENS", 5),
    ),
    enabled: true,
  };
}

export function loadModelRegistry(): ModelRegistry {
  const byId = new Map<string, ModelConfig>();

  const ids = (process.env.UMBRELLA_MODEL_IDS ?? "")
    .split(",")
    .map(normalizeId)
    .filter(Boolean);

  for (const id of ids) {
    const m = modelFromEnv(id);
    if (m) byId.set(m.id, m);
  }

  if (!byId.has("gemma")) {
    const gemma = defaultGemmaModel();
    if (gemma) byId.set(gemma.id, gemma);
  }

  if (byId.size === 0) {
    byId.set("stub", {
      id: "stub",
      label: "Stub",
      provider: "stub",
      model: "stub",
      costPer1k: Math.max(1, envInt("UMBRELLA_CHAT_CREDIT_COST", 10)),
      enabled: true,
    });
  }

  const defaultModelId = normalizeId(
    process.env.UMBRELLA_DEFAULT_MODEL_ID ?? "gemma",
  );

  const pickedDefault = byId.has(defaultModelId)
    ? defaultModelId
    : [...byId.keys()][0];

  return {
    byId,
    defaultModelId: pickedDefault,
    list: [...byId.values()],
  };
}
