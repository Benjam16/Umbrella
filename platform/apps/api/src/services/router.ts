import type { ModelConfig, ModelRegistry } from "./models.js";

export type RouteReason =
  | "default"
  | "requested"
  | "requested_not_found"
  | "requested_disabled";

export type RouteInput = {
  requestedModel?: string;
};

export type RouteDecision = {
  model: ModelConfig;
  reason: RouteReason;
};

export function selectModel(
  registry: ModelRegistry,
  input: RouteInput,
): RouteDecision {
  const requested = input.requestedModel?.trim().toLowerCase();
  if (!requested) {
    const model = registry.byId.get(registry.defaultModelId);
    if (!model) {
      throw new Error(`default_model_not_found:${registry.defaultModelId}`);
    }
    return { model, reason: "default" };
  }

  const model = registry.byId.get(requested);
  if (!model) {
    const fallback = registry.byId.get(registry.defaultModelId);
    if (!fallback) {
      throw new Error(`default_model_not_found:${registry.defaultModelId}`);
    }
    return { model: fallback, reason: "requested_not_found" };
  }
  if (!model.enabled) {
    const fallback = registry.byId.get(registry.defaultModelId);
    if (!fallback) {
      throw new Error(`default_model_not_found:${registry.defaultModelId}`);
    }
    return { model: fallback, reason: "requested_disabled" };
  }
  return { model, reason: "requested" };
}
