import { observeAndExtract } from "./scraper.js";
import { createRunInputDefaults, startRunProcessing } from "./runner.js";
import { sendWatchTriggeredAlerts } from "./watch-alerts.js";
import { store, type SiteWatch } from "../store.js";

function cooldownOk(watch: SiteWatch): boolean {
  const maxHours = watch.thresholds.maxHoursBetweenTriggers;
  if (!maxHours || maxHours <= 0) return true;
  if (!watch.lastTriggeredAt) return true;
  const deltaMs = Date.now() - Date.parse(watch.lastTriggeredAt);
  return deltaMs >= maxHours * 60 * 60 * 1000;
}

function shouldTrigger(
  watch: SiteWatch,
  result: Awaited<ReturnType<typeof observeAndExtract>>,
): { trigger: boolean; reason: string; fingerprint: string } {
  const top = result.items
    .slice(0, 20)
    .map((v) => v.text ?? JSON.stringify(v))
    .join("|")
    .slice(0, 4000);
  const fingerprint = `${result.title}|${result.items.length}|${top}`;
  if (watch.lastFingerprint && watch.lastFingerprint !== fingerprint) {
    return { trigger: true, reason: "observed page fingerprint changed", fingerprint };
  }
  if (
    typeof watch.thresholds.minItems === "number" &&
    result.items.length >= watch.thresholds.minItems
  ) {
    return { trigger: true, reason: `item threshold reached (${result.items.length})`, fingerprint };
  }
  if (watch.thresholds.mustIncludeText) {
    const needle = watch.thresholds.mustIncludeText.toLowerCase();
    const hay = `${result.title}\n${result.rawTextPreview}`.toLowerCase();
    if (hay.includes(needle)) {
      return { trigger: true, reason: `matched text "${watch.thresholds.mustIncludeText}"`, fingerprint };
    }
  }
  return { trigger: false, reason: "no threshold met", fingerprint };
}

export async function evaluateSiteWatch(watchId: string): Promise<void> {
  const watch = store.findSiteWatchById(watchId);
  if (!watch || !watch.active) return;
  const result = await observeAndExtract(watch.target);
  const check = shouldTrigger(watch, result);

  store.updateSiteWatch(watch.id, (w) => {
    w.lastCheckAt = new Date().toISOString();
    w.lastFingerprint = check.fingerprint;
  });

  if (!check.trigger || !cooldownOk(watch)) return;

  const defaults = createRunInputDefaults();
  const objective = `${watch.triggerObjective}\n\nWatch "${watch.name}" triggered: ${check.reason}.\n` +
    `Observed URL: ${watch.target.url}\nSummary: ${result.summary}\n` +
    `Sample items:\n${result.items.slice(0, 5).map((item) => `- ${item.text ?? JSON.stringify(item)}`).join("\n")}`;
  const run = store.createRun({
    userId: watch.userId,
    objective,
    status: "queued",
    maxCredits: defaults.maxCredits,
    maxSteps: defaults.maxSteps,
    maxMinutes: defaults.maxMinutes,
    maxAutoFixes: defaults.maxAutoFixes,
  });
  store.updateSiteWatch(watch.id, (w) => {
    w.lastTriggeredAt = new Date().toISOString();
  });
  startRunProcessing(run.id);
  try {
    await sendWatchTriggeredAlerts({
      watch,
      reason: check.reason,
      runId: run.id,
      result,
    });
  } catch (e) {
    console.warn(
      `[site-watch] alert delivery failed for ${watch.id}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export function startSiteWatchWorker(): void {
  const intervalMs = Math.max(
    10_000,
    Number(process.env.UMBRELLA_SITE_WATCH_INTERVAL_MS ?? 60_000),
  );
  const tick = async () => {
    const active = store.listActiveSiteWatches().slice(0, 20);
    for (const watch of active) {
      try {
        await evaluateSiteWatch(watch.id);
      } catch (e) {
        console.warn(`[site-watch] ${watch.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}
