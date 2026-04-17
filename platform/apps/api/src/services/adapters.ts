import {
  completeOpenAIChat,
  estimatePromptTokens,
  type ChatCompletionResult,
  type ChatMessage,
} from "./inference.js";
import type { ModelConfig } from "./models.js";

export type AdapterRequest = {
  model: ModelConfig;
  messages: ChatMessage[];
};

export type AdapterResponse = ChatCompletionResult;

export interface LlmAdapter {
  complete(req: AdapterRequest): Promise<AdapterResponse>;
}

class OpenAICompatibleAdapter implements LlmAdapter {
  async complete(req: AdapterRequest): Promise<AdapterResponse> {
    if (!req.model.baseUrl) {
      throw new Error(`model_missing_base_url:${req.model.id}`);
    }
    return completeOpenAIChat(
      {
        baseUrl: req.model.baseUrl,
        model: req.model.model,
        apiKey: req.model.apiKey,
      },
      req.messages,
    );
  }
}

class StubAdapter implements LlmAdapter {
  async complete(req: AdapterRequest): Promise<AdapterResponse> {
    const last = req.messages[req.messages.length - 1];
    const preview = last.content.slice(0, 200);
    return {
      content: `[stub] Echo for Umbrella MVP. Last user message (${preview.length} chars): ${preview}${last.content.length > 200 ? "…" : ""}`,
      usage: {
        prompt_tokens: estimatePromptTokens(req.messages),
        completion_tokens: 40,
        total_tokens: estimatePromptTokens(req.messages) + 40,
      },
    };
  }
}

export function adapterForModel(model: ModelConfig): LlmAdapter {
  if (model.provider === "stub") return new StubAdapter();
  return new OpenAICompatibleAdapter();
}
