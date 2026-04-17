import { workerQueue } from "./worker-queue.js";
import { store, type OutreachTarget } from "../store.js";

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

async function dispatchTarget(params: {
  target: OutreachTarget;
  message: string;
}): Promise<{ ok: boolean; detail: string }> {
  const { target, message } = params;
  if (target.channel === "webhook") {
    try {
      const res = await fetch(target.address, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "umbrella-outreach",
          targetId: target.id,
          message,
          variables: target.variables ?? {},
        }),
      });
      return {
        ok: res.ok,
        detail: res.ok ? `webhook_posted:${target.address}` : `webhook_failed_status:${res.status}`,
      };
    } catch (e) {
      return { ok: false, detail: `webhook_error:${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (target.channel === "email") {
    const dryRun = process.env.UMBRELLA_OUTREACH_EMAIL_DRY_RUN !== "false";
    if (dryRun) {
      return { ok: true, detail: `email_dry_run:${target.address}` };
    }
    return { ok: false, detail: "email_provider_not_configured" };
  }
  const linkedinDryRun = process.env.UMBRELLA_OUTREACH_LINKEDIN_DRY_RUN !== "false";
  if (linkedinDryRun) {
    return { ok: true, detail: `linkedin_dry_run:${target.address}` };
  }
  return { ok: false, detail: "linkedin_provider_not_configured" };
}

export function startOutreachDispatch(dispatchId: string): void {
  void workerQueue.enqueue("OUTREACH_WORKER", async () => {
    const dispatch = store.findOutreachDispatchById(dispatchId);
    if (!dispatch) return;
    const campaign = store.findOutreachCampaignById(dispatch.campaignId);
    if (!campaign || !campaign.active) {
      store.updateOutreachDispatch(dispatchId, (d) => {
        d.status = "failed";
        d.completedAt = new Date().toISOString();
        d.logs.push({
          at: new Date().toISOString(),
          level: "error",
          message: campaign ? "campaign_inactive" : "campaign_not_found",
        });
      });
      return;
    }
    store.updateOutreachDispatch(dispatchId, (d) => {
      d.status = "sending";
      d.logs.push({
        at: new Date().toISOString(),
        level: "info",
        message: `Dispatch started for campaign ${campaign.name} with ${campaign.targets.length} targets.`,
      });
    });

    for (const target of campaign.targets) {
      const latest = store.findOutreachDispatchById(dispatchId);
      if (!latest || latest.status === "failed") break;
      const rendered = renderTemplate(campaign.messageTemplate, target.variables ?? {});
      const result = await dispatchTarget({ target, message: rendered });
      store.updateOutreachDispatch(dispatchId, (d) => {
        if (result.ok) d.sent += 1;
        else d.failed += 1;
        d.logs.push({
          at: new Date().toISOString(),
          level: result.ok ? "info" : "warn",
          message: `${target.channel}:${target.address} -> ${result.detail}`,
        });
      });
    }

    store.updateOutreachDispatch(dispatchId, (d) => {
      d.status = d.failed > 0 ? "failed" : "completed";
      d.completedAt = new Date().toISOString();
      d.logs = d.logs.slice(-300);
    });
  });
}
