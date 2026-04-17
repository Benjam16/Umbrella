import type { SiteWatch } from "../store.js";
import type { ScrapeResult } from "./scraper.js";

type TriggerAlertInput = {
  watch: SiteWatch;
  reason: string;
  runId: string;
  result: ScrapeResult;
};

function renderMessage(input: TriggerAlertInput): string {
  return [
    `Umbrella Site-Watch Triggered`,
    `Watch: ${input.watch.name}`,
    `Reason: ${input.reason}`,
    `URL: ${input.watch.target.url}`,
    `Run: ${input.runId}`,
    `Summary: ${input.result.summary}`,
  ].join("\n");
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`alert_http_${res.status}`);
  }
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

export async function sendWatchTriggeredAlerts(input: TriggerAlertInput): Promise<void> {
  const watchAlerts = input.watch.alerts;
  if (!watchAlerts.enabled) return;

  const message = renderMessage(input);
  const payload = {
    event: "site_watch_triggered",
    watchId: input.watch.id,
    watchName: input.watch.name,
    runId: input.runId,
    reason: input.reason,
    url: input.watch.target.url,
    summary: input.result.summary,
    at: new Date().toISOString(),
  };

  const webhookUrl =
    watchAlerts.webhookUrl?.trim() || process.env.UMBRELLA_ALERT_WEBHOOK_URL?.trim();
  const discordWebhookUrl =
    watchAlerts.discordWebhookUrl?.trim() ||
    process.env.UMBRELLA_ALERT_DISCORD_WEBHOOK_URL?.trim();
  const telegramBotToken =
    watchAlerts.telegramBotToken?.trim() ||
    process.env.UMBRELLA_ALERT_TELEGRAM_BOT_TOKEN?.trim();
  const telegramChatId =
    watchAlerts.telegramChatId?.trim() ||
    process.env.UMBRELLA_ALERT_TELEGRAM_CHAT_ID?.trim();

  const tasks: Promise<void>[] = [];
  if (webhookUrl) tasks.push(postJson(webhookUrl, payload));
  if (discordWebhookUrl) {
    tasks.push(postJson(discordWebhookUrl, { content: message }));
  }
  if (telegramBotToken && telegramChatId) {
    tasks.push(sendTelegram(telegramBotToken, telegramChatId, message));
  }
  if (tasks.length === 0) return;
  const settled = await Promise.allSettled(tasks);
  const failures = settled.filter((v) => v.status === "rejected");
  if (failures.length > 0) {
    throw new Error(`alert_delivery_failed:${failures.length}`);
  }
}
