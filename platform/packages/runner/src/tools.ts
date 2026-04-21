import type { ToolCall, ToolResult, ToolName } from "./types";

/**
 * Restricted tool allowlist for the Cloud Sandbox.
 *
 * Principles:
 * - No filesystem, no shell, no secret access. Any blueprint that needs those
 *   MUST route through the eject-to-local flow.
 * - Network egress is domain-allowlisted. The goal is "Competitor Scrape"-class
 *   missions work out of the box without letting the sandbox be abused as a
 *   general-purpose proxy.
 * - Each tool is pure(-ish) and returns structured output that the supervisor
 *   can feed into the next node.
 */

const DEFAULT_ALLOWED_HOSTS = [
  // Public data / research surfaces suitable for a demo sandbox.
  "en.wikipedia.org",
  "api.github.com",
  "raw.githubusercontent.com",
  "news.ycombinator.com",
  "hn.algolia.com",
  "www.reddit.com",
  "api.stackexchange.com",
  "httpbin.org",
];

function allowedHosts(): string[] {
  const extra = (process.env.UMBRELLA_SANDBOX_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ALLOWED_HOSTS, ...extra]));
}

function isHostAllowed(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return allowedHosts().some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

async function httpFetch(input: Record<string, unknown>): Promise<ToolResult> {
  const url = typeof input.url === "string" ? input.url : "";
  if (!url) return { ok: false, error: "missing url" };
  if (!isHostAllowed(url)) {
    return { ok: false, error: `host not allowed by sandbox policy: ${url}` };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Umbrella-CloudSandbox/0.1" },
    });
    const text = await res.text();
    return {
      ok: res.ok,
      output: {
        status: res.status,
        // Cap at ~100kb per call — the supervisor can chunk/summarize.
        body: text.slice(0, 100_000),
        truncated: text.length > 100_000,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

function parseHtml(input: Record<string, unknown>): ToolResult {
  const html = typeof input.html === "string" ? input.html : "";
  if (!html) return { ok: false, error: "missing html" };
  // Intentionally tiny / dependency-free: title + top headings + first paragraphs.
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
  const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi))
    .map((m) => m[1].trim())
    .slice(0, 12);
  const paragraphs = Array.from(html.matchAll(/<p[^>]*>([^<]+)<\/p>/gi))
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 40)
    .slice(0, 8);
  return { ok: true, output: { title, headings, paragraphs } };
}

function parseJson(input: Record<string, unknown>): ToolResult {
  const raw = typeof input.raw === "string" ? input.raw : "";
  try {
    return { ok: true, output: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "invalid json" };
  }
}

function summarize(input: Record<string, unknown>): ToolResult {
  // Extractive summary — deliberately model-free so the sandbox has zero
  // outbound LLM dependency by default. Swap in a real summarizer later.
  const text = typeof input.text === "string" ? input.text : "";
  const maxBullets = Math.min(Math.max(Number(input.bullets) || 5, 3), 10);
  if (!text) return { ok: false, error: "missing text" };
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 40);
  const ranked = sentences
    .map((s, i) => ({ s, score: s.length / (1 + i * 0.1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxBullets)
    .map((r) => `- ${r.s}`);
  return { ok: true, output: { bullets: ranked } };
}

function score(input: Record<string, unknown>): ToolResult {
  // Tiny heuristic "quality score" used by auditor nodes.
  const text = typeof input.text === "string" ? input.text : "";
  const length = text.length;
  const uniqWords = new Set(text.toLowerCase().split(/\W+/).filter(Boolean)).size;
  const richness = Math.min(1, uniqWords / 120);
  const body = Math.min(1, length / 2_000);
  const total = Math.round((richness * 0.6 + body * 0.4) * 100);
  return { ok: true, output: { score: total, richness, body } };
}

const REGISTRY: Record<ToolName, (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult> =
  {
    "http.fetch": httpFetch,
    "parse.html": parseHtml,
    "parse.json": parseJson,
    summarize,
    score,
  };

export async function callTool(call: ToolCall): Promise<ToolResult> {
  const impl = REGISTRY[call.tool];
  if (!impl) return { ok: false, error: `unknown tool: ${call.tool}` };
  return Promise.resolve(impl(call.input ?? {}));
}

export { allowedHosts, isHostAllowed };
