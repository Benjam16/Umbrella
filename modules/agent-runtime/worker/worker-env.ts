/**
 * Environment for child LLM workers: isolated keys, no Telegram secrets,
 * UMBRELLA_INTERNAL_WORKER so llm.ts skips budget assert/record (parent handles both).
 */
export function buildWorkerProcessEnv(
  parentEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...parentEnv };
  e.UMBRELLA_INTERNAL_WORKER = '1';

  const keyOverrides: [string, string][] = [
    ['UMBRELLA_WORKER_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'],
    ['UMBRELLA_WORKER_OPENAI_API_KEY', 'OPENAI_API_KEY'],
    ['UMBRELLA_WORKER_GEMINI_API_KEY', 'GEMINI_API_KEY'],
    ['UMBRELLA_WORKER_GOOGLE_API_KEY', 'GOOGLE_API_KEY'],
  ];
  for (const [from, to] of keyOverrides) {
    const v = parentEnv[from];
    if (v !== undefined && String(v).length > 0) {
      e[to] = v;
    }
  }

  const wProv = parentEnv.UMBRELLA_WORKER_LLM_PROVIDER?.trim();
  if (wProv) {
    e.UMBRELLA_LLM_PROVIDER = wProv;
  }
  const wModel = parentEnv.UMBRELLA_WORKER_MODEL?.trim();
  if (wModel) {
    e.UMBRELLA_MODEL = wModel;
  }

  delete e.TELEGRAM_BOT_TOKEN;
  delete e.TELEGRAM_CHAT_ID;

  return e;
}
