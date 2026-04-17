import { store } from "../store.js";

const VECTOR_DIM = Math.max(32, Math.min(512, Number(process.env.UMBRELLA_MEMORY_VECTOR_DIM ?? 128)));

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2),
  );
}

function vectorize(input: string): number[] {
  const vec = new Array<number>(VECTOR_DIM).fill(0);
  for (const token of tokenize(input)) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    const idx = hash % VECTOR_DIM;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
  }
  return dot;
}

function scoreMatch(queryTokens: Set<string>, text: string, tags: string[]): number {
  const hay = tokenize(`${text} ${tags.join(" ")}`);
  let score = 0;
  for (const token of queryTokens) {
    if (hay.has(token)) score += 1;
  }
  return score;
}

export function retrieveContext(params: {
  userId: string;
  query: string;
  limit?: number;
}): Array<{ text: string; source: string; tags: string[]; createdAt: string }> {
  const limit = Math.max(1, Math.min(10, params.limit ?? 4));
  const mode = (process.env.UMBRELLA_MEMORY_RETRIEVAL_MODE ?? "hybrid").toLowerCase();
  const queryTokens = tokenize(params.query);
  const queryVector = vectorize(params.query);
  const entries = store.listMemoryEntriesByUser(params.userId);
  const ranked = entries
    .map((entry) => ({
      entry,
      lexicalScore: scoreMatch(queryTokens, entry.text, entry.tags),
      vectorScore: cosineSimilarity(queryVector, entry.vector ?? vectorize(`${entry.text} ${entry.tags.join(" ")}`)),
    }))
    .map(({ entry, lexicalScore, vectorScore }) => {
      const combined =
        mode === "lexical"
          ? lexicalScore
          : mode === "vector"
            ? vectorScore * 10
            : lexicalScore * 0.65 + vectorScore * 3.5;
      return { entry, score: combined, lexicalScore, vectorScore };
    })
    .filter((v) => v.score > 0 || v.lexicalScore > 0 || v.vectorScore > 0.1)
    .sort((a, b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt))
    .slice(0, limit)
    .map(({ entry }) => ({
      text: entry.text,
      source: entry.source,
      tags: entry.tags,
      createdAt: entry.createdAt,
    }));
  return ranked;
}

function chunkText(input: string, maxChunk = 900, overlap = 120): string[] {
  const text = input.trim();
  if (text.length <= maxChunk) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChunk);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks.filter((c) => c.length > 0);
}

export function ingestRunMemory(params: {
  userId: string;
  runId: string;
  source: "run_log" | "run_step" | "research" | "summary";
  text: string;
  tags?: string[];
}): void {
  const normalized = params.text.trim();
  if (normalized.length < 8) return;
  const tags = (params.tags ?? []).slice(0, 12);
  const chunks = chunkText(normalized.slice(0, 8000));
  for (const chunk of chunks.slice(0, 12)) {
    store.createMemoryEntry({
      userId: params.userId,
      runId: params.runId,
      source: params.source,
      text: chunk,
      tags,
      vector: vectorize(`${chunk}\n${tags.join(" ")}`),
    });
  }
}
