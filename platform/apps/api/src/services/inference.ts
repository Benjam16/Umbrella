/** OpenAI-compatible chat (Ollama / vLLM / NIM). */

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatCompletionResult = {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export class InferenceHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`inference_http_${status}`);
    this.name = "InferenceHttpError";
  }
}

/** Rough token estimate for pre-flight credit checks (not billing-grade). */
export function estimatePromptTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) chars += m.content.length;
  return Math.ceil(chars / 4) + 512;
}

export function creditsForTokens(totalTokens: number, costPer1k: number): number {
  const t = Math.max(0, totalTokens);
  return Math.max(1, Math.ceil(t / 1000) * costPer1k);
}

type OpenAICompletionJson = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export async function completeOpenAIChat(
  config: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    timeoutMs?: number;
  },
  messages: ChatMessage[],
): Promise<ChatCompletionResult> {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const model = config.model;
  const apiKey = config.apiKey?.trim() ?? "";
  const timeoutMs = Math.max(
    5_000,
    Number(config.timeoutMs ?? process.env.UMBRELLA_INFERENCE_TIMEOUT_MS ?? 120_000),
  );
  const url = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
      signal: ac.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new InferenceHttpError(0, msg);
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  let data: OpenAICompletionJson;
  try {
    data = JSON.parse(raw) as OpenAICompletionJson;
  } catch {
    throw new InferenceHttpError(res.status, raw.slice(0, 2_000));
  }

  if (!res.ok) {
    const errText =
      typeof data.error?.message === "string"
        ? data.error.message
        : raw.slice(0, 2_000);
    throw new InferenceHttpError(res.status, errText);
  }

  const content = data.choices?.[0]?.message?.content ?? "";
  const u = data.usage;
  const fromSum = (u?.prompt_tokens ?? 0) + (u?.completion_tokens ?? 0);
  let total = u?.total_tokens;
  if (total == null || total <= 0) {
    total = fromSum > 0 ? fromSum : estimatePromptTokens(messages);
  }

  return {
    content,
    usage: {
      prompt_tokens: u?.prompt_tokens ?? 0,
      completion_tokens: u?.completion_tokens ?? 0,
      total_tokens: Math.max(1, total),
    },
  };
}
