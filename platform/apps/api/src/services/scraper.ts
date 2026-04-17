import { chromium, type Page } from "playwright-core";
import type { ScrapeTarget } from "@umbrella/shared";
import { adapterForModel } from "./adapters.js";
import { loadModelRegistry } from "./models.js";
import { selectModel } from "./router.js";

export type ScrapeResult = {
  url: string;
  title: string;
  extractedAt: string;
  summary: string;
  items: Array<Record<string, string>>;
  rawTextPreview: string;
};

export type WebExtractionResult = {
  url: string;
  goal: string;
  title: string;
  extractedAt: string;
  summary: string;
  structured: Record<string, unknown>;
  contextPreview: string;
};

function compactText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function looksLikePrice(text: string): boolean {
  return /\$\s?\d|\b\d+(\.\d+)?\s?(usd|usdc|eth)\b/i.test(text);
}

async function inferStructuredExtraction(goal: string, compactContext: string): Promise<Record<string, unknown> | null> {
  try {
    const registry = loadModelRegistry();
    const route = selectModel(registry, { requestedModel: "gemma" });
    const adapter = adapterForModel(route.model);
    const completion = await adapter.complete({
      model: route.model,
      messages: [
        {
          role: "system",
          content:
            "You are Umbrella Web Observer. Return ONLY JSON with shape " +
            "{\"insights\":[{\"label\":\"...\",\"value\":\"...\"}],\"keyPoints\":[\"...\"],\"recommendedNextStep\":\"...\"}.",
        },
        {
          role: "user",
          content:
            `Goal: ${goal}\n` +
            "Use the provided page context to produce structured extraction JSON.\n" +
            `Page context:\n${compactContext.slice(0, 12_000)}`,
        },
      ],
    });
    const fenced = completion.content.match(/```json\s*([\s\S]*?)```/i)?.[1];
    const candidate = fenced ?? completion.content;
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function collectPageContext(page: Page): Promise<{
  title: string;
  compactContext: string;
  bodyText: string;
}> {
  const title = (await page.title()) || page.url();
  const [bodyText, linkLines, buttonLines] = await Promise.all([
    page.locator("body").innerText(),
    page.$$eval("a", (nodes: Element[]) =>
      nodes
        .map((a) => `${(a.textContent || "").trim()} -> ${(a as HTMLAnchorElement).href || ""}`)
        .filter((v: string) => v.trim().length > 0)
        .slice(0, 60),
    ),
    page.$$eval("button, [role='button']", (nodes: Element[]) =>
      nodes
        .map((b) => (b.textContent || "").trim())
        .filter((v: string) => v.length > 0)
        .slice(0, 40),
    ),
  ]);
  const compactBody = compactText(bodyText);
  const compactContext = [
    `TITLE: ${title}`,
    `URL: ${page.url()}`,
    `BODY: ${compactBody.slice(0, 8000)}`,
    `LINKS: ${linkLines.join(" | ")}`,
    `BUTTONS: ${buttonLines.join(" | ")}`,
  ].join("\n");
  return { title, compactContext, bodyText: compactBody };
}

export async function performWebExtraction(url: string, goal: string): Promise<WebExtractionResult> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.UMBRELLA_OBSERVER_CHROMIUM_PATH || undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      userAgent:
        process.env.UMBRELLA_OBSERVER_USER_AGENT ||
        "UmbrellaObserver/0.1 (+https://umbrella.local)",
    });
    const page = await context.newPage();
    const timeoutMs = Math.max(5_000, Number(process.env.UMBRELLA_OBSERVER_TIMEOUT_MS ?? 30_000));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    const scrollPasses = Math.max(0, Math.min(10, Number(process.env.UMBRELLA_OBSERVER_SCROLL_PASSES ?? 4)));
    for (let i = 0; i < scrollPasses; i += 1) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(350);
    }

    const { title, compactContext, bodyText } = await collectPageContext(page);
    const modelStructured = await inferStructuredExtraction(goal, compactContext);
    const fallbackStructured = {
      insights: bodyText
        .split(/(?<=[.!?])\s+/)
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((line, idx) => ({ label: `observation_${idx + 1}`, value: line })),
      keyPoints: ["Model extraction unavailable, using heuristic summary."],
      recommendedNextStep: "Review extracted observations and refine goal/schema.",
    };

    return {
      url,
      goal,
      title,
      extractedAt: new Date().toISOString(),
      summary: `Web extraction completed for goal "${goal}".`,
      structured: modelStructured ?? fallbackStructured,
      contextPreview: compactContext.slice(0, 1800),
    };
  } finally {
    await browser.close();
  }
}

export async function observeAndExtract(target: ScrapeTarget): Promise<ScrapeResult> {
  const extracted = await performWebExtraction(target.url, target.goal);
  const lines = extracted.contextPreview
    .replace(/^TITLE:.*\nURL:.*\nBODY:\s*/i, "")
    .split(/(?<=[.!?])\s+/)
    .map((v) => v.trim())
    .filter(Boolean);

  const keyLines = lines
    .filter((line) => {
      const lower = line.toLowerCase();
      const fieldMatch =
        target.fields.length === 0 ||
        target.fields.some((f) => lower.includes(f.toLowerCase()));
      return fieldMatch || looksLikePrice(line);
    })
    .slice(0, target.maxItems);

  const items = keyLines.map((line, idx) => {
    const item: Record<string, string> = {
      index: String(idx + 1),
      text: line,
    };
    for (const field of target.fields) {
      if (line.toLowerCase().includes(field.toLowerCase())) {
        item[field] = line;
      }
    }
    return item;
  });

  return {
    url: target.url,
    title: extracted.title,
    extractedAt: extracted.extractedAt,
    summary: `Extracted ${items.length} observations for goal "${target.goal}".`,
    items,
    rawTextPreview: extracted.contextPreview.slice(0, 1500),
  };
}
