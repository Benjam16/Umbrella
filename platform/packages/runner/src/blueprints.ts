import type { Blueprint, PlannedNode } from "./types";

/**
 * Blueprint registry — defines what the "Try Now" gallery can execute.
 * Keep blueprints small, legible, and safe for an anonymous cloud sandbox.
 * High-risk blueprints should set maxRisk >= 7 which triggers the
 * "Eject to Local Workstation" affordance in the UI.
 */

function node(
  id: string,
  label: string,
  worker: PlannedNode["worker"],
  risk: PlannedNode["risk"],
  deps: string[],
  requires?: PlannedNode["requires"],
): PlannedNode {
  return { id, label, worker, risk, deps, requires };
}

const competitorScrape: Blueprint = {
  id: "competitor-scrape",
  title: "Competitor Scrape",
  tagline: "Pull public signal on a competitor in under a minute.",
  description:
    "Fetches the target's landing page, extracts positioning, and returns a CEO-ready briefing. Uses only public HTTPS sources — no credentials, no auth.",
  sampleGoal: "Scrape competitor positioning and price points",
  estimatedSeconds: 25,
  maxRisk: 3,
  inputs: [
    {
      key: "url",
      label: "Competitor URL",
      placeholder: "https://en.wikipedia.org/wiki/Stripe,_Inc.",
      required: true,
      type: "url",
      helper: "Sandbox allows wikipedia.org, github.com, hn.algolia.com, reddit.com by default.",
    },
  ],
  plan: () => [
    node("t1", "plan", "supervisor", 1, []),
    node("t2", "fetch landing page", "scraper", 2, ["t1"]),
    node("t3", "extract positioning", "scraper", 2, ["t2"]),
    node("t4", "audit quality", "auditor", 2, ["t3"]),
    node("t5", "CEO briefing", "writer", 2, ["t3", "t4"]),
    node("t6", "seal artifact", "supervisor", 1, ["t5"]),
  ],
};

const repoRecon: Blueprint = {
  id: "repo-recon",
  title: "Repo Recon",
  tagline: "Inspect a GitHub repo and draft an engineering onboarding doc.",
  description:
    "Pulls the repo metadata + README from GitHub's public API and produces a readable architecture briefing. Read-only.",
  sampleGoal: "Produce an engineering onboarding doc for a GitHub repo",
  estimatedSeconds: 20,
  maxRisk: 3,
  inputs: [
    {
      key: "repo",
      label: "GitHub Repo (owner/name)",
      placeholder: "vercel/next.js",
      required: true,
      helper: "Public repos only. No auth required.",
    },
  ],
  plan: () => [
    node("t1", "plan", "supervisor", 1, []),
    node("t2", "fetch repo meta", "scraper", 2, ["t1"]),
    node("t3", "fetch README", "scraper", 2, ["t1"]),
    node("t4", "summarize architecture", "writer", 2, ["t2", "t3"]),
    node("t5", "score briefing", "auditor", 2, ["t4"]),
    node("t6", "seal artifact", "supervisor", 1, ["t5"]),
  ],
};

const sentimentSweep: Blueprint = {
  id: "sentiment-sweep",
  title: "Sentiment Sweep",
  tagline: "Scan Hacker News discussion around a topic.",
  description:
    "Queries HN's public search API for a topic, summarizes top stories, and produces a sentiment digest.",
  sampleGoal: "Summarize HN sentiment on a topic",
  estimatedSeconds: 20,
  maxRisk: 3,
  inputs: [
    {
      key: "query",
      label: "Topic",
      placeholder: "local-first software",
      required: true,
    },
  ],
  plan: () => [
    node("t1", "plan", "supervisor", 1, []),
    node("t2", "search HN", "scraper", 2, ["t1"]),
    node("t3", "summarize headlines", "writer", 2, ["t2"]),
    node("t4", "audit & score", "auditor", 2, ["t3"]),
    node("t5", "seal artifact", "supervisor", 1, ["t4"]),
  ],
};

const localAudit: Blueprint = {
  id: "local-audit",
  title: "Local Repo Audit",
  tagline: "Audit a local codebase (requires CLI — will prompt eject).",
  description:
    "Statically audits a local repo for risky patterns. Cannot run in cloud sandbox — the website will surface an Eject button that generates the matching umbrella pull command.",
  sampleGoal: "Audit local codebase for risk patterns",
  estimatedSeconds: 45,
  maxRisk: 9,
  inputs: [
    {
      key: "path",
      label: "Local path",
      placeholder: "~/Desktop/my-project",
      required: true,
      helper: "Sandbox has no filesystem — this run will prompt you to eject to your local CLI.",
    },
  ],
  plan: () => [
    node("t1", "plan", "supervisor", 1, []),
    node("t2", "enumerate files", "scraper", 8, ["t1"], ["local_fs"]),
    node("t3", "scan for secrets", "auditor", 9, ["t2"], ["local_fs", "secrets"]),
    node("t4", "propose patches", "coder", 8, ["t3"], ["local_fs"]),
    node("t5", "seal artifact", "supervisor", 2, ["t4"]),
  ],
};

export const blueprints: Blueprint[] = [
  competitorScrape,
  repoRecon,
  sentimentSweep,
  localAudit,
];

export function getBlueprint(id: string): Blueprint | undefined {
  return blueprints.find((b) => b.id === id);
}
