import { memory } from './memory.js';
import { auditLlmCall } from './llm-audit.js';
import {
  approxTokens,
  assertAllowsNewLlmCall,
  recordApproxTokenUsage,
} from './token-budget.js';

export type LlmProvider = 'anthropic' | 'openai' | 'google';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

function openaiChatCompletionsUrl(): string {
  const base = process.env.UMBRELLA_OPENAI_BASE_URL?.trim();
  if (base) {
    const b = base.replace(/\/$/, '');
    return `${b}/chat/completions`;
  }
  return `${OPENAI_DEFAULT_BASE}/chat/completions`;
}

function defaultModel(provider: LlmProvider): string {
  const defaults: Record<LlmProvider, string> = {
    anthropic: 'claude-3-5-sonnet-20241022',
    openai: 'gpt-4o',
    google: 'gemini-2.0-flash',
  };
  return defaults[provider];
}

function googleApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

/** Which cloud LLM the daemon uses (Cursor IDE uses local skills; no separate Cursor HTTP API). */
export function resolveLlmConfig():
  | { provider: LlmProvider; model: string; apiKey: string }
  | null {
  const modelOverride = process.env.UMBRELLA_MODEL?.trim();
  const explicit = process.env.UMBRELLA_LLM_PROVIDER?.trim().toLowerCase();

  if (explicit === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    return {
      provider: 'anthropic',
      model: modelOverride || defaultModel('anthropic'),
      apiKey: key,
    };
  }
  if (explicit === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    return {
      provider: 'openai',
      model: modelOverride || defaultModel('openai'),
      apiKey: key,
    };
  }
  if (explicit === 'google' || explicit === 'gemini' || explicit === 'gemma') {
    const key = googleApiKey();
    if (!key) return null;
    return {
      provider: 'google',
      model: modelOverride || defaultModel('google'),
      apiKey: key,
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: modelOverride || defaultModel('anthropic'),
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: modelOverride || defaultModel('openai'),
      apiKey: process.env.OPENAI_API_KEY,
    };
  }
  const gKey = googleApiKey();
  if (gKey) {
    return {
      provider: 'google',
      model: modelOverride || defaultModel('google'),
      apiKey: gKey,
    };
  }

  if (process.env.UMBRELLA_OPENAI_BASE_URL?.trim()) {
    const key =
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.UMBRELLA_OPENAI_API_KEY?.trim() ||
      'ollama';
    return {
      provider: 'openai',
      model: modelOverride || process.env.UMBRELLA_OLLAMA_MODEL?.trim() || 'llama3.2',
      apiKey: key,
    };
  }

  return null;
}

export function isLlmConfigured(): boolean {
  return resolveLlmConfig() !== null;
}

export type LlmCallOptions = {
  /** Injected memory rows; 0 = isolated subagent (no recall block). Default 3. */
  memoryRows?: number;
  /** Token usage bucket in ~/.umbrella/token-usage.json */
  callRole?: string;
};

async function buildPrompts(
  systemPrompt: string,
  userPrompt: string,
  memoryRows = 3,
): Promise<{ system: string; user: string }> {
  if (memoryRows <= 0) {
    return { system: systemPrompt, user: userPrompt };
  }
  const recentMemory = await memory.recall('', memoryRows);
  const context = recentMemory.map((m) => m.content).join('\n');
  const system = `${systemPrompt}\n\nCurrent memory context:\n${context}`;
  return { system, user: userPrompt };
}

async function callAnthropic(system: string, user: string, model: string, apiKey: string): Promise<string> {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: 0.3,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic ${response.status}: ${errText || response.statusText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = data.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Anthropic returned no text block');
  return text;
}

async function callOpenAI(system: string, user: string, model: string, apiKey: string): Promise<string> {
  const url = openaiChatCompletionsUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey !== 'none' && apiKey.trim() !== '') {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI ${response.status}: ${errText || response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned no message content');
  return text;
}

async function callGoogle(system: string, user: string, model: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google AI ${response.status}: ${errText || response.statusText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = data.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new Error('Google AI returned no text');
  return text;
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options?: LlmCallOptions,
): Promise<string> {
  const config = resolveLlmConfig();
  if (!config) {
    throw new Error(
      'No LLM configured: set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI/GOOGLE keys, or UMBRELLA_OPENAI_BASE_URL (e.g. Ollama http://127.0.0.1:11434/v1) with UMBRELLA_OLLAMA_MODEL / OPENAI_API_KEY as needed.',
    );
  }

  await assertAllowsNewLlmCall();

  const memoryRows = options?.memoryRows ?? 3;
  const callRole = options?.callRole ?? 'llm';

  const { system, user } = await buildPrompts(
    systemPrompt,
    userPrompt,
    memoryRows,
  );
  const { provider, model, apiKey } = config;
  const t0 = Date.now();

  try {
    let text: string;
    switch (provider) {
      case 'anthropic':
        text = await callAnthropic(system, user, model, apiKey);
        break;
      case 'openai':
        text = await callOpenAI(system, user, model, apiKey);
        break;
      case 'google':
        text = await callGoogle(system, user, model, apiKey);
        break;
      default: {
        const _p: never = provider;
        throw new Error(`Unknown provider: ${_p}`);
      }
    }
    void auditLlmCall({
      provider,
      model,
      ms: Date.now() - t0,
      ok: true,
    });
    const used = approxTokens(system) + approxTokens(user) + approxTokens(text);
    void recordApproxTokenUsage(used, callRole);
    return text;
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    void auditLlmCall({
      provider,
      model,
      ms: Date.now() - t0,
      ok: false,
      error: err,
    });
    throw e;
  }
}
