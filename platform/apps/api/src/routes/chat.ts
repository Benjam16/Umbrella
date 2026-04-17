import type { Context } from "hono";
import { chatRequestSchema } from "@umbrella/shared";
import {
  creditsForTokens,
  InferenceHttpError,
  estimatePromptTokens,
} from "../services/inference.js";
import { adapterForModel } from "../services/adapters.js";
import { requireUser } from "../services/auth.js";
import { loadModelRegistry } from "../services/models.js";
import { selectModel } from "../services/router.js";
import { store } from "../store.js";

export async function handleChat(c: Context): Promise<Response> {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  const { messages, requestedModel, maxCredits } = parsed.data;
  const registry = loadModelRegistry();
  const route = selectModel(registry, { requestedModel });
  const adapter = adapterForModel(route.model);

  const estimatedTokens = estimatePromptTokens(messages);
  const requiredEstimate = creditsForTokens(estimatedTokens, route.model.costPer1k);
  if (typeof maxCredits === "number" && requiredEstimate > maxCredits) {
    return c.json(
      {
        error: "budget_exceeded",
        requiredCredits: requiredEstimate,
        maxCredits,
      },
      402,
    );
  }
  if (user.credits < requiredEstimate) {
    return c.json(
      {
        error: "payment_required",
        message:
          "Not enough credits for this request (estimated). Top up or shorten the prompt.",
        requiredCredits: requiredEstimate,
        currentCredits: user.credits,
      },
      402,
    );
  }

  let completion;
  try {
    completion = await adapter.complete({ model: route.model, messages });
  } catch (e) {
    if (e instanceof InferenceHttpError) {
      return c.json(
        {
          error: "inference_failed",
          status: e.status,
          message: e.body.slice(0, 500),
          model: route.model.id,
        },
        502,
      );
    }
    return c.json(
      {
        error: "inference_failed",
        message: e instanceof Error ? e.message : String(e),
        model: route.model.id,
      },
      502,
    );
  }

  const actualCost = creditsForTokens(
    completion.usage.total_tokens,
    route.model.costPer1k,
  );
  const boundedCost =
    typeof maxCredits === "number" ? Math.min(actualCost, maxCredits) : actualCost;
  const toCharge = Math.min(boundedCost, user.credits);
  if (actualCost > toCharge) {
    console.warn(
      `[chat] model ${route.model.id} estimated cost ${actualCost}, charging ${toCharge}`,
    );
  }
  const updated = store.adjustCredits(user.id, -toCharge);

  return c.json({
    reply: completion.content,
    routeReason: route.reason,
    modelUsed: route.model.id,
    modelLabel: route.model.label,
    creditsRemaining: updated?.credits ?? user.credits - toCharge,
    usage: {
      creditsCharged: toCharge,
      creditsEstimated: actualCost,
      model: route.model.model,
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens,
    },
  });
}
