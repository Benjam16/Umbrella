import { BLUEPRINTS, DEFAULT_CHAT_CREDIT_COST } from "@umbrella/shared";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import "./App.css";

const STORAGE_API = "umbrella_api_base";
const STORAGE_TOKEN = "umbrella_bearer_token";

function getBase(): string {
  return (
    localStorage.getItem(STORAGE_API) ||
    import.meta.env.VITE_API_URL ||
    "http://127.0.0.1:8787"
  );
}

type ModelItem = {
  id: string;
  label: string;
  costPer1k: number;
};

type RunSummary = {
  id: string;
  objective: string;
  missionSource?: "manual" | "blueprint";
  status: string;
  requestedModel?: string;
  modelUsed?: string;
  routeReason?: string;
  policyProfileName?: string;
  policyProfileVersion?: number;
  reasoningTrace?: string;
  outcomeSummary?: string[];
  creditsCharged: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  checkpointStatus?: "created" | "skipped" | "failed";
  checkpointBranch?: string;
  checkpointBaseBranch?: string;
  checkpointCreatedAt?: string;
  checkpointError?: string;
  pendingDecision?:
    | { type: "approve_risky_step"; stepIndex: number; reason: string }
    | { type: "retry_or_cancel"; stepIndex: number; reason: string }
    | { type: "provide_hint"; stepIndex: number; reason: string; suggestedHint?: string }
    | {
        type: "approve_transaction";
        stepIndex: number;
        reason: string;
        transaction: {
          chainId: number;
          to: string;
          from?: string;
          data?: string;
          value?: string;
          gas?: string;
          description: string;
        };
      };
  pendingActionCount?: number;
};

type RunDetail = RunSummary & {
  tasks?: Array<{
    id: string;
    title: string;
    description: string;
    type: "ANALYSIS" | "CODE_CHANGE" | "COMMAND" | "SCRAPE" | "TRANSACTION" | "VERIFY";
    worker: "SUPERVISOR" | "CODER_WORKER" | "SCRAPER_WORKER" | "AUDITOR_WORKER" | "CRO_WORKER";
    dependsOn: string[];
  }>;
  steps?: Array<{
    index: number;
    title: string;
    status: string;
    attempts: number;
    lastError?: string;
    lastOutput?: string;
  }>;
  logs?: Array<{ at: string; level: string; message: string }>;
  pendingToolActions?: Array<
    | {
        type: "run_command";
        command: string;
        riskScore?: number;
        riskReason?: string;
        riskLevel?: "low" | "medium" | "high";
      }
    | {
        type: "write_file_patch";
        path: string;
        find: string;
        replace: string;
        riskScore?: number;
        riskReason?: string;
        riskLevel?: "low" | "medium" | "high";
      }
    | {
        type: "navigate_and_extract";
        url: string;
        schema: Record<string, string>;
        riskScore?: number;
        riskReason?: string;
        riskLevel?: "low" | "medium" | "high";
      }
    | {
        type: "propose_on_chain_tx";
        network: "base";
        to: string;
        data: string;
        value: string;
        description?: string;
        riskScore?: number;
        riskReason?: string;
        riskLevel?: "low" | "medium" | "high";
      }
    | {
        type: "retrieve_context";
        query: string;
        limit?: number;
        riskScore?: number;
        riskReason?: string;
        riskLevel?: "low" | "medium" | "high";
      }
  >;
};

type PolicyProfile = {
  name: string;
  version: number;
  riskBlockThreshold: number;
  requireApprovalForProtectedWrites: boolean;
  requireApprovalForTransactions: boolean;
  allowedActionTypes?: Array<
    "run_command" | "write_file_patch" | "navigate_and_extract" | "propose_on_chain_tx" | "retrieve_context"
  >;
};

type PolicyDecision = {
  id: string;
  runId?: string;
  stepIndex?: number;
  profileVersion: number;
  policyName: string;
  actionTypes: string[];
  highestRiskScore: number;
  outcome: "allow" | "blocked_for_signature" | "blocked";
  reason: string;
  createdAt: string;
};

type SiteWatch = {
  id: string;
  name: string;
  target: {
    url: string;
    goal: string;
    fields: string[];
    maxItems: number;
  };
  triggerObjective: string;
  thresholds: {
    minItems?: number;
    mustIncludeText?: string;
    maxHoursBetweenTriggers?: number;
  };
  alerts: {
    enabled: boolean;
    webhookUrl?: string;
    discordWebhookUrl?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
  };
  active: boolean;
  lastTriggeredAt?: string;
  lastCheckAt?: string;
};

type WorkerStat = {
  worker:
    | "SUPERVISOR"
    | "CODER_WORKER"
    | "SCRAPER_WORKER"
    | "AUDITOR_WORKER"
    | "CRO_WORKER"
    | "OUTREACH_WORKER";
  active: number;
  queued: number;
  limit: number;
};

type OutreachTarget = {
  id: string;
  channel: "email" | "webhook" | "linkedin";
  address: string;
  variables?: Record<string, string>;
};

type OutreachCampaign = {
  id: string;
  name: string;
  objective: string;
  messageTemplate: string;
  targets: OutreachTarget[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type OutreachDispatch = {
  id: string;
  campaignId: string;
  status: "queued" | "sending" | "completed" | "failed";
  sent: number;
  failed: number;
  logs: Array<{ at: string; level: "info" | "warn" | "error"; message: string }>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type RiskLevel = "low" | "medium" | "high";
type WalletStatus = {
  provider: "local" | "coinbase_agentkit";
  ready: boolean;
  missing: string[];
  warning?: string;
  availableActions?: number;
};

type BackupIntegrityStatus = {
  sweepEnabled: boolean;
  lastSweep: null | {
    sweptAt: string;
    ok: boolean;
    reason: string;
    checked: number;
    failures: Array<{ snapshotId?: string; error: string }>;
  };
};

type WebResearchCard = {
  stepIndex: number;
  title: string;
  url: string;
  payload: string;
};

type SwarmNode = {
  idx: number;
  title: string;
  worker: string;
  type: string;
  deps: string[];
  status: string;
};

type DagNodeData = {
  idx: number;
  label: string;
  status: string;
};

type GalleryBlueprint = {
  id: string;
  name: string;
  description: string;
  initialMission: string;
  suggestedMaxCredits: number;
  category: "shopping" | "growth" | "support" | "crypto" | "devops";
  suggestedFilenames?: string[];
  mintedFromRunId?: string;
  mintedAt?: string;
  icon?: string;
  missionVariables?: string[];
};

function extractBlueprintVarKeys(template: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const re = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ordered.push(m[1]);
    }
  }
  return ordered;
}

function applyBlueprintTemplate(template: string, values: Record<string, string>): string {
  let out = template;
  for (const key of extractBlueprintVarKeys(template)) {
    out = out.split(`{{${key}}}`).join(values[key]?.trim() ?? "");
  }
  return out;
}

function assessActionRisk(
  action:
    | { type: "run_command"; command: string }
    | { type: "write_file_patch"; path: string; find: string; replace: string }
    | { type: "navigate_and_extract"; url: string; schema: Record<string, string> }
    | { type: "retrieve_context"; query: string; limit?: number }
    | { type: "propose_on_chain_tx"; network: "base"; to: string; data: string; value: string; description?: string },
): { score: number; reason: string; level: RiskLevel } {
  if (action.type === "propose_on_chain_tx") {
    return {
      score: 10,
      reason: "This action proposes an on-chain transaction that can move funds.",
      level: "high",
    };
  }
  if (action.type === "navigate_and_extract") {
    if (/\b(login|checkout|account)\b/i.test(action.url)) {
      return {
        score: 5,
        reason: "Scraping target includes authentication or account context.",
        level: "medium",
      };
    }
    return {
      score: 2,
      reason: "Read-only web observation action.",
      level: "low",
    };
  }
  if (action.type === "retrieve_context") {
    return {
      score: 1,
      reason: "Reads local memory vault context only.",
      level: "low",
    };
  }
  if (action.type === "run_command") {
    const command = action.command.trim();
    if (/\b(rm\s+-rf|drop\s+table|truncate|shutdown|reboot|deploy|production|secret|private[_-]?key)\b/i.test(command)) {
      return {
        score: 9,
        reason: "Command matches destructive or production-impact pattern.",
        level: "high",
      };
    }
    if (/\b(test|build|lint|format)\b/i.test(command)) {
      return {
        score: 2,
        reason: "Verification/build command is typically low risk.",
        level: "low",
      };
    }
    return {
      score: 5,
      reason: "General shell command with moderate uncertainty.",
      level: "medium",
    };
  }
  const path = action.path.toLowerCase();
  if (path.includes(".env") || path.includes("secret") || path.includes("key")) {
    return {
      score: 8,
      reason: "Patch touches sensitive configuration or credential-like path.",
      level: "high",
    };
  }
  if (path.includes("package.json") || path.includes("docker") || path.includes("infra")) {
    return {
      score: 7,
      reason: "Patch changes runtime or infrastructure surface.",
      level: "medium",
    };
  }
  return {
    score: 4,
    reason: "Application patch with moderate impact.",
    level: "medium",
  };
}

function humanizeTimelineMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("planning started")) return "Understanding your mission and planning steps.";
  if (lower.includes("plan created")) return "Created a task plan and started work.";
  if (lower.includes("self-healing attempt")) return "Trying a fix after a failed check.";
  if (lower.includes("verify command passed")) return "Validation checks passed.";
  if (lower.includes("verification passed")) return "Quality checks passed for this step.";
  if (lower.includes("verification failed")) return "A check failed, preparing a repair attempt.";
  if (lower.includes("paused for wallet signature")) return "Waiting for your wallet signature.";
  if (lower.includes("blocked")) return "Paused and waiting for your input.";
  if (lower.includes("run completed")) return "Finished successfully.";
  return raw;
}

function smartSummary(run: RunDetail | null): string {
  if (!run) return "Select a run to see what the agent is doing.";
  if (run.status === "completed") return "Your mission is complete and verified.";
  if (run.status === "blocked_for_signature")
    return "Umbrella is ready to continue after your transaction signature.";
  if (run.status === "blocked_for_human")
    return "Umbrella is paused and needs your guidance to proceed safely.";
  if (run.status === "blocked") return "Umbrella is paused for your approval.";
  if (run.status === "failed") return "This mission failed before completion.";
  const activeStep = run.steps?.find((s) => s.status === "in_progress");
  if (activeStep) return `Working on: ${activeStep.title}`;
  return "Umbrella is actively processing your mission.";
}

function webResearchCards(run: RunDetail | null): WebResearchCard[] {
  if (!run?.steps) return [];
  const out: WebResearchCard[] = [];
  for (const step of run.steps) {
    if (!step.lastOutput) continue;
    const urlMatch = step.lastOutput.match(/navigate_and_extract:\s*(\S+)/i);
    const marker = "web_research_json:";
    const markerIdx = step.lastOutput.indexOf(marker);
    if (!urlMatch || markerIdx < 0) continue;
    const payloadRaw = step.lastOutput.slice(markerIdx + marker.length).trim();
    const previewCut = payloadRaw.indexOf("\npreview:");
    const payload = (previewCut >= 0 ? payloadRaw.slice(0, previewCut) : payloadRaw).trim();
    out.push({
      stepIndex: step.index,
      title: step.title,
      url: urlMatch[1] ?? "unknown",
      payload,
    });
  }
  return out.slice(0, 8);
}

function buildSwarmNodes(run: RunDetail | null): SwarmNode[] {
  if (!run?.tasks || !run.steps) return [];
  return run.tasks.map((task, idx) => {
    const step = run.steps?.find((s) => s.index === idx);
    return {
      idx,
      title: task.title,
      worker: task.worker,
      type: task.type,
      deps: task.dependsOn,
      status: step?.status ?? "pending",
    };
  });
}

function dagStyleForStatus(status: string): CSSProperties {
  if (status === "completed") {
    return {
      border: "1px solid rgba(16, 185, 129, 0.7)",
      background: "rgba(16, 185, 129, 0.15)",
      color: "#d1fae5",
      borderRadius: 10,
      padding: 8,
      width: 220,
    };
  }
  if (status === "in_progress") {
    return {
      border: "1px solid rgba(59, 130, 246, 0.8)",
      background: "rgba(59, 130, 246, 0.16)",
      color: "#dbeafe",
      borderRadius: 10,
      padding: 8,
      width: 220,
    };
  }
  if (status === "failed") {
    return {
      border: "1px solid rgba(245, 158, 11, 0.8)",
      background: "rgba(245, 158, 11, 0.18)",
      color: "#fef3c7",
      borderRadius: 10,
      padding: 8,
      width: 220,
    };
  }
  return {
    border: "1px solid rgba(148, 163, 184, 0.6)",
    background: "rgba(100, 116, 139, 0.12)",
    color: "#e2e8f0",
    borderRadius: 10,
    padding: 8,
    width: 220,
  };
}

function buildDagGraph(
  run: RunDetail | null,
): { nodes: Array<Node<DagNodeData>>; edges: Edge[]; criticalPathNodeIds: Set<string> } {
  if (!run?.tasks || run.tasks.length === 0) return { nodes: [], edges: [], criticalPathNodeIds: new Set() };
  const stepsByIndex = new Map((run.steps ?? []).map((s) => [s.index, s]));
  const idxByTaskId = new Map(run.tasks.map((task, idx) => [task.id, idx]));

  const levelByIndex = new Map<number, number>();
  const resolveLevel = (idx: number): number => {
    const existing = levelByIndex.get(idx);
    if (typeof existing === "number") return existing;
    const task = run.tasks?.[idx];
    if (!task || task.dependsOn.length === 0) {
      levelByIndex.set(idx, 0);
      return 0;
    }
    const level =
      Math.max(
        ...task.dependsOn.map((depId) => {
          const depIdx = idxByTaskId.get(depId);
          return typeof depIdx === "number" ? resolveLevel(depIdx) : 0;
        }),
      ) + 1;
    levelByIndex.set(idx, level);
    return level;
  };

  run.tasks.forEach((_, idx) => {
    resolveLevel(idx);
  });

  const laneCount = new Map<number, number>();
  const nodes: Array<Node<DagNodeData>> = run.tasks.map((task, idx) => {
    const level = levelByIndex.get(idx) ?? 0;
    const lane = laneCount.get(level) ?? 0;
    laneCount.set(level, lane + 1);
    const step = stepsByIndex.get(idx);
    const status = step?.status ?? "pending";
    return {
      id: `task-${idx}`,
      position: { x: level * 280, y: lane * 140 },
      data: {
        idx,
        label: `${task.title}\n[${task.worker}] [${task.type}]`,
        status,
      },
      style: dagStyleForStatus(status),
    };
  });

  const nextByIndex = new Map<number, number[]>();
  run.tasks.forEach((task, idx) => {
    task.dependsOn.forEach((depId) => {
      const depIdx = idxByTaskId.get(depId);
      if (typeof depIdx !== "number") return;
      const curr = nextByIndex.get(depIdx) ?? [];
      curr.push(idx);
      nextByIndex.set(depIdx, curr);
    });
  });

  const memoLongest = new Map<number, { len: number; next?: number }>();
  const longestFrom = (idx: number): { len: number; next?: number } => {
    const cached = memoLongest.get(idx);
    if (cached) return cached;
    const next = nextByIndex.get(idx) ?? [];
    if (next.length === 0) {
      const result = { len: 1 };
      memoLongest.set(idx, result);
      return result;
    }
    let best: { len: number; next?: number } = { len: 1 };
    for (const n of next) {
      const cand = longestFrom(n);
      if (cand.len + 1 > best.len) {
        best = { len: cand.len + 1, next: n };
      }
    }
    memoLongest.set(idx, best);
    return best;
  };

  let criticalStart = 0;
  let criticalLen = 0;
  for (let i = 0; i < run.tasks.length; i += 1) {
    const len = longestFrom(i).len;
    if (len > criticalLen) {
      criticalLen = len;
      criticalStart = i;
    }
  }
  const criticalPathNodeIds = new Set<string>();
  let walker: number | undefined = criticalStart;
  while (typeof walker === "number") {
    criticalPathNodeIds.add(`task-${walker}`);
    walker = longestFrom(walker).next;
  }

  const edges: Edge[] = [];
  run.tasks.forEach((task, idx) => {
    task.dependsOn.forEach((depId) => {
      const depIdx = idxByTaskId.get(depId);
      if (typeof depIdx !== "number") return;
      const isCritical = criticalPathNodeIds.has(`task-${depIdx}`) && criticalPathNodeIds.has(`task-${idx}`);
      edges.push({
        id: `edge-${depIdx}-${idx}`,
        source: `task-${depIdx}`,
        target: `task-${idx}`,
        animated: (stepsByIndex.get(depIdx)?.status ?? "") === "completed" && (stepsByIndex.get(idx)?.status ?? "") !== "completed",
        style: isCritical
          ? { stroke: "#fb923c", strokeWidth: 2.4 }
          : { stroke: "rgba(148, 163, 184, 0.55)", strokeWidth: 1.2 },
      });
    });
  });

  return { nodes, edges, criticalPathNodeIds };
}

function sandboxEvents(run: RunDetail | null): Array<{ at: string; level: string; message: string }> {
  if (!run?.logs) return [];
  return run.logs
    .filter((entry) => /sandbox preflight|sandbox transcript|sandbox strict policy/i.test(entry.message))
    .slice(-12);
}

export default function App() {
  const [apiBase, setApiBase] = useState(getBase);
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN) || "");
  const [email, setEmail] = useState("dev@example.com");
  const [credits, setCredits] = useState<number | null>(null);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [chat, setChat] = useState("");
  const [runObjective, setRunObjective] = useState("");
  const [runMaxCredits, setRunMaxCredits] = useState("200");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [copyingOutcome, setCopyingOutcome] = useState(false);
  const [humanHint, setHumanHint] = useState("");
  const [watches, setWatches] = useState<SiteWatch[]>([]);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchName, setWatchName] = useState("Competitor pricing watch");
  const [watchUrl, setWatchUrl] = useState("https://example.com");
  const [watchGoal, setWatchGoal] = useState("Track pricing and conversion-copy changes");
  const [watchFields, setWatchFields] = useState("price, plan, signup, conversion");
  const [watchTriggerObjective, setWatchTriggerObjective] = useState(
    "Analyze observed change and propose updated landing-page copy and offer strategy.",
  );
  const [watchAlertsEnabled, setWatchAlertsEnabled] = useState(false);
  const [watchWebhookUrl, setWatchWebhookUrl] = useState("");
  const [watchDiscordWebhookUrl, setWatchDiscordWebhookUrl] = useState("");
  const [watchTelegramBotToken, setWatchTelegramBotToken] = useState("");
  const [watchTelegramChatId, setWatchTelegramChatId] = useState("");
  const [outreachCampaigns, setOutreachCampaigns] = useState<OutreachCampaign[]>([]);
  const [outreachDispatches, setOutreachDispatches] = useState<OutreachDispatch[]>([]);
  const [outreachBusy, setOutreachBusy] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaignName, setCampaignName] = useState("Launch outreach sprint");
  const [campaignObjective, setCampaignObjective] = useState("Engage qualified leads with personalized value proposition.");
  const [campaignTemplate, setCampaignTemplate] = useState(
    "Hi {{name}},\n\nWe built a sovereign agentic workstation that can automate your growth loops safely. Want a 10-minute walkthrough?\n\n- Umbrella Team",
  );
  const [campaignTargetsRaw, setCampaignTargetsRaw] = useState(
    "email:alice@example.com|name=Alice\nwebhook:https://example.com/hook|name=GrowthTeam",
  );
  const [workerStats, setWorkerStats] = useState<WorkerStat[]>([]);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [backupIntegrity, setBackupIntegrity] = useState<BackupIntegrityStatus | null>(null);
  const [policyProfile, setPolicyProfile] = useState<PolicyProfile | null>(null);
  const [policyDecisions, setPolicyDecisions] = useState<PolicyDecision[]>([]);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyAllowedActions, setPolicyAllowedActions] = useState("");
  const [selectedBlueprintId, setSelectedBlueprintId] = useState("");
  const [blueprintFilter, setBlueprintFilter] = useState<"all" | "minted" | "builtin">("all");
  const [blueprints, setBlueprints] = useState<GalleryBlueprint[]>(
    BLUEPRINTS.map((bp) => ({
      id: bp.id,
      name: bp.title,
      description: bp.summary,
      initialMission: bp.objectiveTemplate,
      suggestedMaxCredits: bp.suggestedMaxCredits,
      category: bp.category,
      suggestedFilenames: [`${bp.id}-report`, `${bp.id}-insights`, `${bp.id}-strategy`],
    })),
  );
  const [exportingResearchStep, setExportingResearchStep] = useState<number | null>(null);
  const [researchFileNames, setResearchFileNames] = useState<Record<number, string>>({});
  const [hideCompletedSwarmNodes, setHideCompletedSwarmNodes] = useState(true);
  const [compactDag, setCompactDag] = useState(true);
  const [focusedDagNodeId, setFocusedDagNodeId] = useState<string | null>(null);
  const [mintingBlueprint, setMintingBlueprint] = useState(false);
  const [mintModalOpen, setMintModalOpen] = useState(false);
  const [mintName, setMintName] = useState("");
  const [mintDescription, setMintDescription] = useState("");
  const [mintCategory, setMintCategory] = useState<GalleryBlueprint["category"]>("growth");
  const [mintIcon, setMintIcon] = useState("");
  const [blueprintVarValues, setBlueprintVarValues] = useState<Record<string, string>>({});
  const [rollbackCommands, setRollbackCommands] = useState<string[] | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [rollbackPreviewToken, setRollbackPreviewToken] = useState<string | null>(null);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-80), `[${new Date().toLocaleTimeString()}] ${line}`]);
  }, []);

  const saveApiBase = () => {
    localStorage.setItem(STORAGE_API, apiBase.trim());
    pushLog(`API base saved: ${apiBase.trim()}`);
  };

  const refreshMe = useCallback(async () => {
    if (!token) {
      setCredits(null);
      return;
    }
    const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      pushLog(`/v1/me failed: ${r.status}`);
      setCredits(null);
      return;
    }
    const j = (await r.json()) as { credits: number };
    setCredits(j.credits);
  }, [apiBase, token, pushLog]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const fetchModels = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/models`);
      const j = (await r.json()) as {
        defaultModel?: string;
        models?: Array<{ id: string; label: string; costPer1k: number; enabled: boolean }>;
      };
      if (!r.ok || !j.models) return;
      const enabled = j.models.filter((m) => m.enabled).map((m) => ({
        id: m.id,
        label: m.label,
        costPer1k: m.costPer1k,
      }));
      setModels(enabled);
      if (!selectedModel && j.defaultModel) setSelectedModel(j.defaultModel);
    } catch {
      // no-op
    }
  }, [apiBase, selectedModel]);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  const fetchWalletStatus = useCallback(async () => {
    if (!token) {
      setWalletStatus(null);
      return;
    }
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/wallet/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { wallet?: WalletStatus };
      if (!r.ok || !j.wallet) return;
      setWalletStatus(j.wallet);
    } catch {
      // no-op
    }
  }, [apiBase, token]);

  const fetchBackupIntegrity = useCallback(async () => {
    if (!token) {
      setBackupIntegrity(null);
      return;
    }
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/health/dr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 403) {
        setBackupIntegrity(null);
        return;
      }
      const j = (await r.json()) as BackupIntegrityStatus;
      if (!r.ok) return;
      setBackupIntegrity(j);
    } catch {
      // no-op
    }
  }, [apiBase, token]);

  useEffect(() => {
    void fetchWalletStatus();
  }, [fetchWalletStatus]);

  useEffect(() => {
    void fetchBackupIntegrity();
  }, [fetchBackupIntegrity]);

  const fetchBlueprints = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/blueprints`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { blueprints?: GalleryBlueprint[] };
      if (!r.ok || !j.blueprints || j.blueprints.length === 0) return;
      setBlueprints(j.blueprints);
    } catch {
      // keep local fallback BLUEPRINTS
    }
  }, [apiBase, token]);

  useEffect(() => {
    void fetchBlueprints();
  }, [fetchBlueprints]);

  const fetchPolicyProfile = useCallback(async () => {
    if (!token) {
      setPolicyProfile(null);
      return;
    }
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/policy/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { profile?: PolicyProfile };
      if (!r.ok || !j.profile) {
        pushLog(`/v1/policy/profile failed: ${r.status}`);
        return;
      }
      setPolicyProfile(j.profile);
      setPolicyAllowedActions((j.profile.allowedActionTypes ?? []).join(", "));
    } catch {
      // no-op
    }
  }, [apiBase, token, pushLog]);

  const fetchPolicyDecisions = useCallback(async () => {
    if (!token) {
      setPolicyDecisions([]);
      return;
    }
    const runQuery = selectedRunId ? `?runId=${encodeURIComponent(selectedRunId)}&limit=20` : "?limit=20";
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/policy/decisions${runQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { decisions?: PolicyDecision[] };
      if (!r.ok || !j.decisions) return;
      setPolicyDecisions(j.decisions);
    } catch {
      // no-op
    }
  }, [apiBase, token, selectedRunId]);

  useEffect(() => {
    void fetchPolicyProfile();
  }, [fetchPolicyProfile]);

  const fetchRuns = useCallback(async () => {
    if (!token) {
      setRuns([]);
      setSelectedRun(null);
      setSelectedRunId("");
      return;
    }
    const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/runs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = (await r.json()) as { runs?: RunSummary[] };
    if (!r.ok || !j.runs) {
      pushLog(`/v1/runs failed: ${r.status}`);
      return;
    }
    setRuns(j.runs);
    if (!selectedRunId && j.runs[0]) {
      setSelectedRunId(j.runs[0].id);
      return;
    }
    if (selectedRunId && !j.runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(j.runs[0]?.id ?? "");
    }
  }, [apiBase, token, selectedRunId, pushLog]);

  const fetchRunDetail = useCallback(async () => {
    if (!token || !selectedRunId) {
      setSelectedRun(null);
      return;
    }
    const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/runs/${selectedRunId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = (await r.json()) as { run?: RunDetail };
    if (!r.ok || !j.run) {
      pushLog(`/v1/runs/${selectedRunId} failed: ${r.status}`);
      return;
    }
    setSelectedRun(j.run);
  }, [apiBase, token, selectedRunId, pushLog]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    void fetchRunDetail();
  }, [fetchRunDetail]);

  useEffect(() => {
    setFocusedDagNodeId(null);
  }, [selectedRunId]);

  useEffect(() => {
    if (!selectedRun || focusedDagNodeId) return;
    const inProgress = (selectedRun.steps ?? []).find((s) => s.status === "in_progress");
    if (inProgress) {
      setFocusedDagNodeId(`task-${inProgress.index}`);
      return;
    }
    const firstPending = (selectedRun.steps ?? []).find((s) => s.status === "pending");
    if (firstPending) {
      setFocusedDagNodeId(`task-${firstPending.index}`);
    }
  }, [selectedRun, focusedDagNodeId]);

  useEffect(() => {
    void fetchPolicyDecisions();
  }, [fetchPolicyDecisions]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => {
      void fetchRuns();
      void fetchRunDetail();
      void refreshMe();
      void fetchWorkerStats();
      void fetchPolicyDecisions();
      void fetchBackupIntegrity();
    }, 4000);
    return () => window.clearInterval(id);
  }, [token, fetchRuns, fetchRunDetail, refreshMe, fetchPolicyDecisions, fetchBackupIntegrity]);

  const fetchWorkerStats = useCallback(async () => {
    if (!token) {
      setWorkerStats([]);
      return;
    }
    const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/workers/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = (await r.json()) as { workers?: WorkerStat[] };
    if (!r.ok || !j.workers) {
      pushLog(`/v1/workers/status failed: ${r.status}`);
      return;
    }
    setWorkerStats(j.workers);
  }, [apiBase, token, pushLog]);

  useEffect(() => {
    void fetchWorkerStats();
  }, [fetchWorkerStats]);

  const fetchWatches = useCallback(async () => {
    if (!token) {
      setWatches([]);
      return;
    }
    const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/observer/watches`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = (await r.json()) as { watches?: SiteWatch[] };
    if (!r.ok || !j.watches) {
      pushLog(`/v1/observer/watches failed: ${r.status}`);
      return;
    }
    setWatches(j.watches);
  }, [apiBase, token, pushLog]);

  const fetchOutreachCampaigns = useCallback(async () => {
    if (!token) {
      setOutreachCampaigns([]);
      setSelectedCampaignId("");
      return;
    }
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/outreach/campaigns`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { campaigns?: OutreachCampaign[] };
      if (!r.ok || !j.campaigns) {
        pushLog(`/v1/outreach/campaigns failed: ${r.status}`);
        return;
      }
      setOutreachCampaigns(j.campaigns);
      if (!selectedCampaignId && j.campaigns[0]) setSelectedCampaignId(j.campaigns[0].id);
      if (selectedCampaignId && !j.campaigns.some((c) => c.id === selectedCampaignId)) {
        setSelectedCampaignId(j.campaigns[0]?.id ?? "");
      }
    } catch {
      // no-op
    }
  }, [apiBase, token, pushLog, selectedCampaignId]);

  const fetchOutreachDispatches = useCallback(async () => {
    if (!token) {
      setOutreachDispatches([]);
      return;
    }
    const query = selectedCampaignId ? `?campaignId=${encodeURIComponent(selectedCampaignId)}` : "";
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/outreach/dispatches${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { dispatches?: OutreachDispatch[] };
      if (!r.ok || !j.dispatches) return;
      setOutreachDispatches(j.dispatches);
    } catch {
      // no-op
    }
  }, [apiBase, token, selectedCampaignId]);

  useEffect(() => {
    void fetchWatches();
  }, [fetchWatches]);

  useEffect(() => {
    void fetchOutreachCampaigns();
  }, [fetchOutreachCampaigns]);

  useEffect(() => {
    void fetchOutreachDispatches();
  }, [fetchOutreachDispatches]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => {
      void fetchWatches();
      void fetchOutreachCampaigns();
      void fetchOutreachDispatches();
    }, 6000);
    return () => window.clearInterval(id);
  }, [token, fetchWatches, fetchOutreachCampaigns, fetchOutreachDispatches]);

  const devSignup = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/auth/dev-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!r.ok) {
        pushLog(`signup failed: ${r.status} ${JSON.stringify(j)}`);
        return;
      }
      const t = (j as { token: string }).token;
      setToken(t);
      localStorage.setItem(STORAGE_TOKEN, t);
      pushLog("Dev signup OK — token stored locally.");
      setCredits((j as { user: { credits: number } }).user.credits);
    } catch (e) {
      pushLog(`signup error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const sendChat = async () => {
    if (!token || !chat.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: chat.trim() }],
        }),
      });
      const j = await r.json();
      if (r.status === 402) {
        pushLog(`402 Payment required: ${JSON.stringify(j)}`);
        await refreshMe();
        return;
      }
      if (r.status === 502) {
        pushLog(`502 Inference error: ${JSON.stringify(j)}`);
        await refreshMe();
        return;
      }
      if (!r.ok) {
        pushLog(`chat failed: ${r.status} ${JSON.stringify(j)}`);
        return;
      }
      pushLog(`Assistant: ${(j as { reply: string }).reply}`);
      setCredits((j as { creditsRemaining: number }).creditsRemaining);
      setChat("");
    } catch (e) {
      pushLog(`chat error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const createRun = async () => {
    if (!token) return;
    let objective = runObjective.trim();
    if (selectedBlueprintId && selectedBlueprint) {
      if (blueprintVariableKeys.length > 0) {
        const missing = blueprintVariableKeys.filter((k) => !(blueprintVarValues[k]?.trim()));
        if (missing.length > 0) {
          pushLog(`Fill all mission variables: ${missing.join(", ")}`);
          return;
        }
        objective = applyBlueprintTemplate(selectedBlueprint.initialMission, blueprintVarValues);
      }
    }
    if (objective.length < 8) return;
    setRunBusy(true);
    try {
      const payload: {
        objective: string;
        missionSource: "manual" | "blueprint";
        requestedModel?: string;
        maxCredits?: number;
      } = {
        objective,
        missionSource: selectedBlueprintId ? "blueprint" : "manual",
      };
      if (selectedModel) payload.requestedModel = selectedModel;
      const n = Number(runMaxCredits);
      if (Number.isFinite(n) && n > 0) payload.maxCredits = n;
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        pushLog(`create run failed: ${r.status} ${JSON.stringify(j)}`);
        return;
      }
      const run = (j as { run: { id: string } }).run;
      pushLog(`Run created: ${run.id}`);
      setRunObjective("");
      setSelectedRunId(run.id);
      await fetchRuns();
      await fetchRunDetail();
      await refreshMe();
    } catch (e) {
      pushLog(`create run error: ${String(e)}`);
    } finally {
      setRunBusy(false);
    }
  };

  const applyBlueprint = (bp: GalleryBlueprint) => {
    setSelectedBlueprintId(bp.id);
    setBlueprintVarValues({});
    setRunObjective(bp.initialMission);
    setRunMaxCredits(String(bp.suggestedMaxCredits));
    if (bp.suggestedFilenames && bp.suggestedFilenames.length > 0) {
      const defaults = Object.fromEntries(bp.suggestedFilenames.map((v, idx) => [idx, v]));
      setResearchFileNames(defaults);
    }
    pushLog(`Blueprint selected: ${bp.name}`);
  };

  const runAction = async (
    action: "continue" | "retry" | "cancel",
    opts?: { txHash?: string; hint?: string },
  ) => {
    if (!token || !selectedRunId) return;
    setRunBusy(true);
    try {
      const endpoint =
        action === "cancel"
          ? `/v1/runs/${selectedRunId}/cancel`
          : `/v1/runs/${selectedRunId}/approve`;
      const r = await fetch(`${apiBase.replace(/\/$/, "")}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body:
          action === "cancel"
            ? undefined
            : JSON.stringify({
                action,
                txHash: opts?.txHash,
                hint: opts?.hint,
              }),
      });
      const j = await r.json();
      if (!r.ok) {
        pushLog(`run action failed: ${r.status} ${JSON.stringify(j)}`);
        return;
      }
      pushLog(`Run action "${action}" sent.`);
      await fetchRuns();
      await fetchRunDetail();
      await refreshMe();
    } catch (e) {
      pushLog(`run action error: ${String(e)}`);
    } finally {
      setRunBusy(false);
    }
  };

  const exportResearch = async (stepIndex: number) => {
    if (!token || !selectedRunId) return;
    setExportingResearchStep(stepIndex);
    try {
      const filename = researchFileNames[stepIndex]?.trim();
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/runs/${selectedRunId}/export-research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stepIndex, filename: filename || undefined }),
      });
      const j = (await r.json()) as { path?: string; error?: string };
      if (!r.ok) {
        pushLog(`Research export failed: ${j.error || r.status}`);
        return;
      }
      pushLog(`Research exported: ${j.path || "saved"}`);
    } catch {
      pushLog("Research export failed: network_error");
    } finally {
      setExportingResearchStep(null);
    }
  };

  const copyOutcomeSummary = async () => {
    if (!selectedRun?.outcomeSummary || selectedRun.outcomeSummary.length === 0) return;
    setCopyingOutcome(true);
    try {
      const text = selectedRun.outcomeSummary.slice(0, 3).map((v) => `- ${v}`).join("\n");
      await navigator.clipboard.writeText(text);
      pushLog("CEO Briefing copied to clipboard.");
    } catch {
      pushLog("Failed to copy CEO Briefing.");
    } finally {
      setCopyingOutcome(false);
    }
  };

  const openMintModal = () => {
    if (!selectedRun || selectedRun.status !== "completed") return;
    setMintName(selectedRun.objective.slice(0, 100));
    const defaultDesc =
      selectedRun.outcomeSummary?.join("\n") || "Minted from a successful Umbrella mission.";
    setMintDescription(defaultDesc.length >= 8 ? defaultDesc : "Minted from a successful Umbrella mission.");
    setMintCategory("growth");
    setMintIcon("");
    setMintModalOpen(true);
  };

  const submitMintBlueprint = async () => {
    if (!token || !selectedRun) return;
    if (mintDescription.trim().length < 8) {
      pushLog("Description must be at least 8 characters.");
      return;
    }
    setMintingBlueprint(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/blueprints/mint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          runId: selectedRun.id,
          name: mintName.trim() || undefined,
          description: mintDescription.trim(),
          category: mintCategory,
          icon: mintIcon.trim() || undefined,
        }),
      });
      const j = (await r.json()) as {
        blueprint?: { id: string; name: string };
        generalizedBy?: string;
        error?: string;
      };
      if (!r.ok || !j.blueprint) {
        pushLog(`Blueprint mint failed: ${j.error || r.status}`);
        return;
      }
      pushLog(`Blueprint minted: ${j.blueprint.name}${j.generalizedBy ? ` (${j.generalizedBy})` : ""}`);
      setMintModalOpen(false);
      await fetchBlueprints();
      setSelectedBlueprintId(j.blueprint.id);
    } catch {
      pushLog("Blueprint mint failed: network_error");
    } finally {
      setMintingBlueprint(false);
    }
  };

  const previewRollback = async () => {
    if (!token || !selectedRunId) return;
    setRollbackBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/runs/${selectedRunId}/rollback-preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as {
        commands?: string[];
        previewToken?: string;
        previewExpiresInMs?: number;
        error?: string;
      };
      if (!r.ok || !j.commands) {
        pushLog(`Rollback preview failed: ${j.error || r.status}`);
        return;
      }
      setRollbackCommands(j.commands);
      setRollbackPreviewToken(j.previewToken || null);
      pushLog(
        `Rollback preview generated${j.previewExpiresInMs ? ` (expires in ${Math.round(j.previewExpiresInMs / 60000)}m)` : ""}.`,
      );
    } catch {
      pushLog("Rollback preview failed: network_error");
    } finally {
      setRollbackBusy(false);
    }
  };

  const executeRollback = async () => {
    if (!token || !selectedRunId) return;
    if (!rollbackPreviewToken) {
      pushLog("Rollback execute blocked: preview token missing. Run preview first.");
      return;
    }
    setRollbackBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/runs/${selectedRunId}/rollback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: "EXECUTE_ROLLBACK", previewToken: rollbackPreviewToken }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; commands?: string[] };
      if (!r.ok || !j.ok) {
        pushLog(`Rollback execute failed: ${j.error || r.status}`);
        return;
      }
      if (j.commands) setRollbackCommands(j.commands);
      setRollbackPreviewToken(null);
      pushLog("Rollback executed successfully.");
      await fetchRunDetail();
    } catch {
      pushLog("Rollback execute failed: network_error");
    } finally {
      setRollbackBusy(false);
    }
  };

  const savePolicyProfile = async () => {
    if (!token || !policyProfile) return;
    setPolicyBusy(true);
    try {
      const allowedActionTypes = policyAllowedActions
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean) as PolicyProfile["allowedActionTypes"];
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/policy/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          riskBlockThreshold: policyProfile.riskBlockThreshold,
          requireApprovalForProtectedWrites: policyProfile.requireApprovalForProtectedWrites,
          requireApprovalForTransactions: policyProfile.requireApprovalForTransactions,
          allowedActionTypes: allowedActionTypes && allowedActionTypes.length > 0 ? allowedActionTypes : undefined,
        }),
      });
      const j = (await r.json()) as { profile?: PolicyProfile; error?: string };
      if (!r.ok || !j.profile) {
        pushLog(`Policy update failed: ${j.error || r.status}`);
        return;
      }
      setPolicyProfile(j.profile);
      setPolicyAllowedActions((j.profile.allowedActionTypes ?? []).join(", "));
      pushLog(`Policy profile updated to version ${j.profile.version}.`);
      await fetchPolicyDecisions();
    } catch {
      pushLog("Policy update failed: network_error");
    } finally {
      setPolicyBusy(false);
    }
  };

  const signOut = () => {
    setToken("");
    localStorage.removeItem(STORAGE_TOKEN);
    setCredits(null);
    setBackupIntegrity(null);
    pushLog("Signed out (token cleared).");
  };

  const createWatch = async () => {
    if (!token || !watchName.trim() || !watchUrl.trim() || !watchTriggerObjective.trim()) return;
    setWatchBusy(true);
    try {
      const payload = {
        name: watchName.trim(),
        target: {
          url: watchUrl.trim(),
          goal: watchGoal.trim() || "Observe page changes",
          fields: watchFields
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          maxItems: 40,
        },
        triggerObjective: watchTriggerObjective.trim(),
        thresholds: {
          minItems: 1,
        },
        alerts: {
          enabled: watchAlertsEnabled,
          webhookUrl: watchWebhookUrl.trim() || undefined,
          discordWebhookUrl: watchDiscordWebhookUrl.trim() || undefined,
          telegramBotToken: watchTelegramBotToken.trim() || undefined,
          telegramChatId: watchTelegramChatId.trim() || undefined,
        },
        active: true,
      };
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/observer/watches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        pushLog(`create watch failed: ${r.status} ${JSON.stringify(j)}`);
        return;
      }
      pushLog(`Watch created: ${(j as { watch: { id: string } }).watch.id}`);
      await fetchWatches();
    } catch (e) {
      pushLog(`create watch error: ${String(e)}`);
    } finally {
      setWatchBusy(false);
    }
  };

  const evaluateWatch = async (id: string) => {
    if (!token) return;
    setWatchBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/observer/watches/${id}/evaluate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (!r.ok) {
        pushLog(`evaluate watch failed: ${r.status} ${JSON.stringify(j)}`);
        return;
      }
      pushLog(`Watch evaluated: ${id}`);
      await fetchWatches();
      await fetchRuns();
    } catch (e) {
      pushLog(`evaluate watch error: ${String(e)}`);
    } finally {
      setWatchBusy(false);
    }
  };

  const setWatchActive = async (id: string, active: boolean) => {
    if (!token) return;
    setWatchBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/observer/watches/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active }),
      });
      const j = await r.json();
      if (!r.ok) {
        pushLog(`update watch failed: ${r.status} ${JSON.stringify(j)}`);
        return;
      }
      await fetchWatches();
    } catch (e) {
      pushLog(`update watch error: ${String(e)}`);
    } finally {
      setWatchBusy(false);
    }
  };

  const parseCampaignTargets = (): Array<{
    channel: "email" | "webhook" | "linkedin";
    address: string;
    variables?: Record<string, string>;
  }> => {
    const lines = campaignTargetsRaw
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    const parsed = lines
      .map((line) => {
        const [left, varsRaw] = line.split("|");
        const sep = left.indexOf(":");
        if (sep <= 0) return null;
        const channel = left.slice(0, sep).trim().toLowerCase();
        const address = left.slice(sep + 1).trim();
        if (!address) return null;
        if (channel !== "email" && channel !== "webhook" && channel !== "linkedin") return null;
        const variables =
          varsRaw
            ?.split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .reduce<Record<string, string>>((acc, pair) => {
              const eq = pair.indexOf("=");
              if (eq <= 0) return acc;
              const key = pair.slice(0, eq).trim();
              const value = pair.slice(eq + 1).trim();
              if (key) acc[key] = value;
              return acc;
            }, {}) ?? undefined;
        return {
          channel: channel as "email" | "webhook" | "linkedin",
          address,
          ...(variables && Object.keys(variables).length > 0 ? { variables } : {}),
        };
      })
      .filter(
        (v): v is {
          channel: "email" | "webhook" | "linkedin";
          address: string;
          variables?: Record<string, string>;
        } => v !== null,
      );
    return parsed;
  };

  const createOutreachCampaign = async () => {
    if (!token || !campaignName.trim() || !campaignObjective.trim() || !campaignTemplate.trim()) return;
    const targets = parseCampaignTargets();
    if (targets.length === 0) {
      pushLog("Outreach campaign create blocked: no valid targets.");
      return;
    }
    setOutreachBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/outreach/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: campaignName.trim(),
          objective: campaignObjective.trim(),
          messageTemplate: campaignTemplate,
          targets,
          active: true,
        }),
      });
      const j = (await r.json()) as { campaign?: { id: string }; error?: string };
      if (!r.ok || !j.campaign) {
        pushLog(`Outreach campaign create failed: ${j.error || r.status}`);
        return;
      }
      setSelectedCampaignId(j.campaign.id);
      pushLog(`Outreach campaign created: ${j.campaign.id}`);
      await fetchOutreachCampaigns();
      await fetchOutreachDispatches();
    } catch {
      pushLog("Outreach campaign create failed: network_error");
    } finally {
      setOutreachBusy(false);
    }
  };

  const triggerOutreachDispatch = async (campaignId: string) => {
    if (!token) return;
    setOutreachBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/v1/outreach/campaigns/${campaignId}/dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { dispatch?: { id: string }; error?: string };
      if (!r.ok || !j.dispatch) {
        pushLog(`Outreach dispatch failed: ${j.error || r.status}`);
        return;
      }
      pushLog(`Outreach dispatch queued: ${j.dispatch.id}`);
      setSelectedCampaignId(campaignId);
      await fetchOutreachDispatches();
      await fetchWorkerStats();
    } catch {
      pushLog("Outreach dispatch failed: network_error");
    } finally {
      setOutreachBusy(false);
    }
  };

  const confirmTransaction = async () => {
    if (!selectedRun?.pendingDecision || selectedRun.pendingDecision.type !== "approve_transaction") {
      return;
    }
    const tx = selectedRun.pendingDecision.transaction;
    const ethereum = (window as Window & {
      ethereum?: {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      };
    }).ethereum;
    if (!ethereum) {
      pushLog("No injected wallet found. Open with MetaMask or Coinbase Wallet extension.");
      return;
    }
    setRunBusy(true);
    try {
      await ethereum.request({ method: "eth_requestAccounts" });
      const txHash = (await ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: tx.from,
            to: tx.to,
            data: tx.data ?? "0x",
            value: tx.value ?? "0x0",
            gas: tx.gas,
          },
        ],
      })) as string;
      pushLog(`Transaction submitted: ${txHash}`);
      await runAction("continue", { txHash });
    } catch (e) {
      pushLog(`Transaction confirmation failed: ${String(e)}`);
    } finally {
      setRunBusy(false);
    }
  };

  const selectedBlueprint = useMemo(
    () => blueprints.find((b) => b.id === selectedBlueprintId) ?? null,
    [blueprints, selectedBlueprintId],
  );
  const blueprintVariableKeys = useMemo(() => {
    if (!selectedBlueprint) return [];
    if (selectedBlueprint.missionVariables && selectedBlueprint.missionVariables.length > 0) {
      return selectedBlueprint.missionVariables;
    }
    return extractBlueprintVarKeys(selectedBlueprint.initialMission);
  }, [selectedBlueprint]);

  useEffect(() => {
    setBlueprintVarValues({});
  }, [selectedBlueprintId]);

  useEffect(() => {
    if (!selectedBlueprint || blueprintVariableKeys.length === 0) return;
    setRunObjective(applyBlueprintTemplate(selectedBlueprint.initialMission, blueprintVarValues));
  }, [selectedBlueprint, blueprintVariableKeys, blueprintVarValues]);

  const blockedCount = runs.filter(
    (r) =>
      r.status === "blocked" ||
      r.status === "blocked_for_signature" ||
      r.status === "blocked_for_human",
  ).length;
  const filteredRuns = showBlockedOnly
    ? runs.filter(
        (r) =>
          r.status === "blocked" ||
          r.status === "blocked_for_signature" ||
          r.status === "blocked_for_human",
      )
    : runs;
  const focusFirstBlocked = () => {
    const first = runs.find(
      (r) =>
        r.status === "blocked" ||
        r.status === "blocked_for_signature" ||
        r.status === "blocked_for_human",
    );
    if (first) setSelectedRunId(first.id);
  };
  const researchCards = webResearchCards(selectedRun);
  const swarmNodes = buildSwarmNodes(selectedRun);
  const dagGraph = useMemo(() => buildDagGraph(selectedRun), [selectedRun]);
  const activeSwarmNodes = swarmNodes.filter((n) => n.status === "in_progress");
  const swarmActive = activeSwarmNodes.length > 1;
  const visibleSwarmNodes = hideCompletedSwarmNodes
    ? swarmNodes.filter((n) => n.status !== "completed")
    : swarmNodes;
  const sandboxLogEvents = sandboxEvents(selectedRun);
  const filteredBlueprints = blueprints.filter((bp) => {
    if (blueprintFilter === "minted") return Boolean(bp.mintedFromRunId);
    if (blueprintFilter === "builtin") return !bp.mintedFromRunId;
    return true;
  });
  const focusedDagNode = dagGraph.nodes.find((n) => n.id === focusedDagNodeId);
  const focusedStep =
    typeof focusedDagNode?.data?.idx === "number"
      ? selectedRun?.steps?.find((s) => s.index === focusedDagNode.data.idx)
      : undefined;
  const blockedDagNodes = dagGraph.nodes.filter((n) => {
    const status = n.data.status;
    return status === "failed" || status === "pending";
  });
  const jumpToNextBlockedNode = () => {
    if (blockedDagNodes.length === 0) return;
    const currentIndex = blockedDagNodes.findIndex((n) => n.id === focusedDagNodeId);
    const next = blockedDagNodes[(currentIndex + 1) % blockedDagNodes.length] ?? blockedDagNodes[0];
    if (next) setFocusedDagNodeId(next.id);
  };

  const canSubmitObjective = (): boolean => {
    if (selectedBlueprint && blueprintVariableKeys.length > 0) {
      if (blueprintVariableKeys.some((k) => !(blueprintVarValues[k]?.trim()))) return false;
      const composed = applyBlueprintTemplate(selectedBlueprint.initialMission, blueprintVarValues);
      return composed.trim().length >= 8;
    }
    return runObjective.trim().length >= 8;
  };

  const drDotClass = !token
    ? "dr-dot dr-dot-off"
    : !backupIntegrity
      ? "dr-dot dr-dot-off"
      : backupIntegrity.lastSweep?.ok
        ? "dr-dot dr-dot-ok"
        : "dr-dot dr-dot-warn";
  const drDotLabel = !token
    ? "DR health unavailable (signed out)"
    : !backupIntegrity
      ? "DR health unavailable for this role or not loaded"
      : backupIntegrity.lastSweep?.ok
        ? "DR health healthy"
        : "DR health attention needed";

  return (
    <div className="shell">
      <header className="top">
        <h1>
          Umbrella <span className={drDotClass} title={drDotLabel} aria-label={drDotLabel} />
        </h1>
        <p className="tag">Desktop shell · credit-metered API (MVP)</p>
      </header>

      <section className="panel">
        <h2>API</h2>
        <div className="row">
          <input
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="http://127.0.0.1:8787"
          />
          <button type="button" onClick={saveApiBase}>
            Save
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Swarm Status</h2>
        <div className="run-list">
          {workerStats.length === 0 ? (
            <p className="pill">No worker stats yet.</p>
          ) : (
            workerStats.map((w) => (
              <div key={w.worker} className="run-item">
                <strong>{w.worker}</strong>
                <div className="pill">
                  active: {w.active} | queued: {w.queued} | limit: {w.limit}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Template Gallery</h2>
        <div className="row">
          <button
            type="button"
            className={blueprintFilter === "all" ? "" : "ghost"}
            onClick={() => setBlueprintFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={blueprintFilter === "minted" ? "" : "ghost"}
            onClick={() => setBlueprintFilter("minted")}
          >
            Minted
          </button>
          <button
            type="button"
            className={blueprintFilter === "builtin" ? "" : "ghost"}
            onClick={() => setBlueprintFilter("builtin")}
          >
            Built-in
          </button>
        </div>
        <div className="run-list">
          {filteredBlueprints.map((bp) => {
            const varKeys = extractBlueprintVarKeys(bp.initialMission);
            return (
            <button
              key={bp.id}
              type="button"
              className={`run-item ${selectedBlueprintId === bp.id ? "active" : ""}`}
              onClick={() => applyBlueprint(bp)}
            >
              <strong>
                {bp.icon ? `${bp.icon} ` : ""}
                {bp.name}
              </strong>{" "}
              · {bp.description}
              <div className="pill">
                {bp.category} · suggested max credits: {bp.suggestedMaxCredits}
                {varKeys.length > 0 ? ` · vars: ${varKeys.join(", ")}` : ""}
              </div>
              {bp.mintedFromRunId && (
                <div className="minted-badge">
                  Minted from run {bp.mintedFromRunId.slice(0, 8)}
                  {bp.mintedAt ? ` · ${new Date(bp.mintedAt).toLocaleDateString()}` : ""}
                </div>
              )}
            </button>
            );
          })}
          {filteredBlueprints.length === 0 && (
            <p className="pill">No blueprints in this filter.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Observer · Site-Watch</h2>
        <div className="row stack">
          <input
            value={watchName}
            onChange={(e) => setWatchName(e.target.value)}
            placeholder="Watch name"
          />
          <input
            value={watchUrl}
            onChange={(e) => setWatchUrl(e.target.value)}
            placeholder="https://competitor.com/pricing"
          />
          <input
            value={watchGoal}
            onChange={(e) => setWatchGoal(e.target.value)}
            placeholder="Watch goal"
          />
          <input
            value={watchFields}
            onChange={(e) => setWatchFields(e.target.value)}
            placeholder="fields (comma-separated)"
          />
          <textarea
            value={watchTriggerObjective}
            onChange={(e) => setWatchTriggerObjective(e.target.value)}
            placeholder="Objective to run when trigger condition is met"
            rows={3}
          />
          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={watchAlertsEnabled}
              onChange={(e) => setWatchAlertsEnabled(e.target.checked)}
            />
            enable trigger alerts
          </label>
          <input
            value={watchWebhookUrl}
            onChange={(e) => setWatchWebhookUrl(e.target.value)}
            placeholder="Webhook URL (optional)"
          />
          <input
            value={watchDiscordWebhookUrl}
            onChange={(e) => setWatchDiscordWebhookUrl(e.target.value)}
            placeholder="Discord webhook URL (optional)"
          />
          <input
            value={watchTelegramBotToken}
            onChange={(e) => setWatchTelegramBotToken(e.target.value)}
            placeholder="Telegram bot token (optional)"
          />
          <input
            value={watchTelegramChatId}
            onChange={(e) => setWatchTelegramChatId(e.target.value)}
            placeholder="Telegram chat id (optional)"
          />
          <div className="row">
            <button type="button" disabled={!token || watchBusy} onClick={() => void createWatch()}>
              Add watch
            </button>
            <button type="button" className="ghost" disabled={!token || watchBusy} onClick={() => void fetchWatches()}>
              Refresh watches
            </button>
          </div>
        </div>
        <div className="run-list">
          {watches.length === 0 ? (
            <p className="pill">No watches configured.</p>
          ) : (
            watches.slice(0, 10).map((w) => (
              <div key={w.id} className="run-item">
                <strong>{w.active ? "ACTIVE" : "PAUSED"}</strong> · {w.name}
                <div className="pill">{w.target.url}</div>
                <div className="pill">alerts: {w.alerts.enabled ? "on" : "off"}</div>
                <div className="row">
                  <button type="button" className="ghost" disabled={!token || watchBusy} onClick={() => void evaluateWatch(w.id)}>
                    Evaluate now
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!token || watchBusy}
                    onClick={() => void setWatchActive(w.id, !w.active)}
                  >
                    {w.active ? "Pause" : "Resume"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Outreach · CRM Connectors</h2>
        <div className="row stack">
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Campaign name"
          />
          <textarea
            value={campaignObjective}
            onChange={(e) => setCampaignObjective(e.target.value)}
            rows={2}
            placeholder="Campaign objective"
          />
          <textarea
            value={campaignTemplate}
            onChange={(e) => setCampaignTemplate(e.target.value)}
            rows={4}
            placeholder="Message template. Use {{name}} variables."
          />
          <textarea
            value={campaignTargetsRaw}
            onChange={(e) => setCampaignTargetsRaw(e.target.value)}
            rows={4}
            placeholder={"Targets, one per line:\nemail:alice@example.com|name=Alice\nwebhook:https://example.com/hook|name=Team"}
          />
          <div className="row">
            <button
              type="button"
              disabled={!token || outreachBusy}
              onClick={() => void createOutreachCampaign()}
            >
              {outreachBusy ? "Working..." : "Create campaign"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!token || outreachBusy}
              onClick={() => void fetchOutreachCampaigns()}
            >
              Refresh campaigns
            </button>
          </div>
        </div>
        <div className="run-list">
          {outreachCampaigns.length === 0 ? (
            <p className="pill">No outreach campaigns yet.</p>
          ) : (
            outreachCampaigns.slice(0, 8).map((c) => (
              <div
                key={c.id}
                className={`run-item ${selectedCampaignId === c.id ? "active" : ""}`}
              >
                <strong>{c.active ? "ACTIVE" : "PAUSED"}</strong> · {c.name}
                <div className="pill">{c.targets.length} targets</div>
                <div className="pill">{c.objective.slice(0, 120)}</div>
                <div className="row">
                  <button type="button" className="ghost" onClick={() => setSelectedCampaignId(c.id)}>
                    View dispatches
                  </button>
                  <button
                    type="button"
                    disabled={!token || outreachBusy || !c.active}
                    onClick={() => void triggerOutreachDispatch(c.id)}
                  >
                    Dispatch now
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="timeline">
          <p>
            <strong>Dispatch Activity</strong>
          </p>
          <pre className="run-pre outreach-trail">
            {outreachDispatches.length > 0
              ? outreachDispatches
                  .slice(0, 12)
                  .map((d) => {
                    const t = new Date(d.updatedAt).toLocaleTimeString();
                    const sample = d.logs.slice(-2).map((l) => `${l.level}: ${l.message}`).join(" | ");
                    return `[${t}] ${d.status.toUpperCase()} sent:${d.sent} failed:${d.failed} campaign:${d.campaignId.slice(0, 8)}${sample ? `\n  ${sample}` : ""}`;
                  })
                  .join("\n\n")
              : "No outreach dispatches yet."}
          </pre>
        </div>
      </section>

      <section className="panel">
        <h2>Session</h2>
        {credits !== null && (
          <p className="credits">
            Credits: <strong>{credits}</strong>
          </p>
        )}
        {walletStatus && (
          <div className="pending-actions">
            <p>
              <strong>Wallet:</strong> {walletStatus.provider} ·{" "}
              <span className={walletStatus.ready ? "pill" : "warn"}>
                {walletStatus.ready ? "ready" : "not ready"}
              </span>
            </p>
            {typeof walletStatus.availableActions === "number" && (
              <p className="pill">agent actions available: {walletStatus.availableActions}</p>
            )}
            {walletStatus.warning && <p className="warn">{walletStatus.warning}</p>}
            {walletStatus.missing.length > 0 && (
              <p className="pill">missing env: {walletStatus.missing.join(", ")}</p>
            )}
          </div>
        )}
        {backupIntegrity && (
          <div className="pending-actions">
            <p>
              <strong>DR Health:</strong>{" "}
              <span className={backupIntegrity.lastSweep?.ok ? "dr-ok" : "dr-warn"}>
                {backupIntegrity.lastSweep?.ok ? "healthy" : "attention needed"}
              </span>
            </p>
            <p className="pill">
              sweep: {backupIntegrity.sweepEnabled ? "enabled" : "disabled"}
              {backupIntegrity.lastSweep
                ? ` · checked ${backupIntegrity.lastSweep.checked} snapshot(s)`
                : " · no sweep recorded yet"}
            </p>
            {backupIntegrity.lastSweep && (
              <p className="pill">
                last: {new Date(backupIntegrity.lastSweep.sweptAt).toLocaleString()} (
                {backupIntegrity.lastSweep.reason})
              </p>
            )}
            {backupIntegrity.lastSweep && backupIntegrity.lastSweep.failures.length > 0 && (
              <p className="warn">
                failures: {backupIntegrity.lastSweep.failures.slice(0, 3).map((f) => f.error).join(", ")}
              </p>
            )}
          </div>
        )}
        {!token ? (
          <div className="row stack">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              type="email"
            />
            <button type="button" disabled={busy} onClick={() => void devSignup()}>
              Dev signup (local only)
            </button>
          </div>
        ) : (
          <div className="row">
            <span className="pill">Bearer token in localStorage</span>
            <button type="button" onClick={() => void refreshMe()}>
              Refresh credits
            </button>
            <button type="button" className="ghost" onClick={() => void fetchWalletStatus()}>
              Refresh wallet
            </button>
            <button type="button" className="ghost" onClick={() => void fetchBackupIntegrity()}>
              Refresh DR health
            </button>
            <button type="button" className="ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Policy Engine</h2>
        {!policyProfile ? (
          <p className="pill">Sign in to load tenant policy profile.</p>
        ) : (
          <div className="row stack">
            <p className="pill">
              Active profile: {policyProfile.name} · v{policyProfile.version}
            </p>
            <label className="pill">
              Risk block threshold: {policyProfile.riskBlockThreshold}
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={policyProfile.riskBlockThreshold}
              onChange={(e) =>
                setPolicyProfile((prev) =>
                  prev ? { ...prev, riskBlockThreshold: Number(e.target.value) } : prev,
                )
              }
            />
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={policyProfile.requireApprovalForProtectedWrites}
                onChange={(e) =>
                  setPolicyProfile((prev) =>
                    prev ? { ...prev, requireApprovalForProtectedWrites: e.target.checked } : prev,
                  )
                }
              />
              require approval for protected writes
            </label>
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={policyProfile.requireApprovalForTransactions}
                onChange={(e) =>
                  setPolicyProfile((prev) =>
                    prev ? { ...prev, requireApprovalForTransactions: e.target.checked } : prev,
                  )
                }
              />
              require approval for transactions
            </label>
            <input
              value={policyAllowedActions}
              onChange={(e) => setPolicyAllowedActions(e.target.value)}
              placeholder="allowed actions (optional csv: run_command, write_file_patch, ...)"
            />
            <div className="row">
              <button type="button" disabled={!token || policyBusy} onClick={() => void savePolicyProfile()}>
                {policyBusy ? "Saving..." : "Save policy"}
              </button>
              <button type="button" className="ghost" disabled={!token} onClick={() => void fetchPolicyProfile()}>
                Refresh policy
              </button>
            </div>
            <div className="timeline">
              <p>
                <strong>Decision Trail</strong>
              </p>
              <pre className="run-pre policy-trail">
                {policyDecisions.length > 0
                  ? policyDecisions
                      .slice(0, 20)
                      .map((d) => {
                        const t = new Date(d.createdAt).toLocaleTimeString();
                        const runRef = d.runId ? ` run:${d.runId.slice(0, 8)}` : "";
                        const stepRef = typeof d.stepIndex === "number" ? ` step:${d.stepIndex + 1}` : "";
                        return `[${t}] ${d.outcome.toUpperCase()} v${d.profileVersion} (${d.policyName}) risk:${d.highestRiskScore}${runRef}${stepRef}\n  actions: ${d.actionTypes.join(", ")}\n  reason: ${d.reason}`;
                      })
                      .join("\n\n")
                  : "No policy decisions yet for this scope."}
              </pre>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>
          Chat (token-metered when the API has inference configured; else flat{" "}
          {DEFAULT_CHAT_CREDIT_COST} credits / send)
        </h2>
        <textarea
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          placeholder="Message Umbrella…"
          rows={4}
        />
        <button type="button" disabled={busy || !token} onClick={() => void sendChat()}>
          Send (costs credits)
        </button>
      </section>

      <section className="panel">
        <h2>Runs (Autonomy MVP)</h2>
        <p className="pill">{smartSummary(selectedRun)}</p>
        {selectedBlueprint && blueprintVariableKeys.length > 0 && (
          <div className="pending-actions">
            <p>
              <strong>Mission variables</strong>
            </p>
            <p className="pill">Fill each placeholder for this blueprint, then review the preview below.</p>
            <div className="row stack">
              {blueprintVariableKeys.map((key) => (
                <input
                  key={key}
                  value={blueprintVarValues[key] ?? ""}
                  onChange={(e) =>
                    setBlueprintVarValues((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={`Value for {{${key}}}`}
                />
              ))}
            </div>
          </div>
        )}
        <textarea
          value={runObjective}
          onChange={(e) => setRunObjective(e.target.value)}
          readOnly={blueprintVariableKeys.length > 0}
          placeholder={
            blueprintVariableKeys.length > 0
              ? "Live preview of the composed mission (read-only when using variables)"
              : "Objective (e.g., Refactor auth and verify with tests)"
          }
          rows={3}
        />
        <div className="row">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={!token || runBusy}
          >
            <option value="">default model</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.costPer1k}/1k)
              </option>
            ))}
          </select>
          <input
            value={runMaxCredits}
            onChange={(e) => setRunMaxCredits(e.target.value)}
            placeholder="max credits"
            inputMode="numeric"
          />
          <button
            type="button"
            disabled={!token || runBusy || !canSubmitObjective()}
            onClick={() => void createRun()}
          >
            Create run
          </button>
          <button type="button" className="ghost" disabled={!token || runBusy} onClick={() => void fetchRuns()}>
            Refresh runs
          </button>
          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={showBlockedOnly}
              onChange={(e) => setShowBlockedOnly(e.target.checked)}
            />
            blocked only ({blockedCount})
          </label>
          <button
            type="button"
            className="ghost"
            disabled={!token || blockedCount === 0}
            onClick={focusFirstBlocked}
          >
            Focus blocked
          </button>
        </div>

        <div className="run-list">
          {filteredRuns.length === 0 ? (
            <p className="pill">No runs yet.</p>
          ) : (
            filteredRuns.slice(0, 8).map((r) => (
              <button
                key={r.id}
                type="button"
                className={`run-item ${selectedRunId === r.id ? "active" : ""}`}
                onClick={() => setSelectedRunId(r.id)}
              >
                <strong>{r.status}</strong> · {r.objective.slice(0, 80)}
              </button>
            ))
          )}
        </div>

        {selectedRun && (
          <div className="run-detail">
            {selectedRun.status === "completed" && (
              <div className="outcome-card">
                <p>
                  <strong>Mission Successful</strong>
                </p>
                {selectedRun.outcomeSummary && selectedRun.outcomeSummary.length > 0 && (
                  <ul>
                    {selectedRun.outcomeSummary.slice(0, 3).map((item, idx) => (
                      <li key={`outcome-${idx}`}>{item}</li>
                    ))}
                  </ul>
                )}
                <div className="row">
                  {selectedRun.outcomeSummary && selectedRun.outcomeSummary.length > 0 && (
                    <button
                      type="button"
                      className="ghost"
                      disabled={copyingOutcome}
                      onClick={() => void copyOutcomeSummary()}
                    >
                      {copyingOutcome ? "Copying..." : "Copy CEO Briefing"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={mintingBlueprint}
                    onClick={() => openMintModal()}
                  >
                    Mint to Gallery…
                  </button>
                </div>
              </div>
            )}
            <p>
              <strong>Run:</strong> {selectedRun.id}
            </p>
            <p>
              <strong>Model:</strong> {selectedRun.modelUsed || selectedRun.requestedModel || "default"}{" "}
              ({selectedRun.routeReason || "n/a"})
            </p>
            <p>
              <strong>Policy snapshot:</strong> {selectedRun.policyProfileName || "default"} v
              {selectedRun.policyProfileVersion ?? 1}
            </p>
            {selectedRun.reasoningTrace && (
              <details className="timeline">
                <summary>Supervisor reasoning trace</summary>
                <pre className="run-pre">{selectedRun.reasoningTrace}</pre>
              </details>
            )}
            <p>
              <strong>Credits charged:</strong> {selectedRun.creditsCharged}
            </p>
            {selectedRun.checkpointStatus && (
              <div className="pending-actions">
                <p>
                  <strong>Checkpoint:</strong> {selectedRun.checkpointStatus}
                </p>
                {selectedRun.checkpointBranch && (
                  <p className="pill">
                    rollback target: {selectedRun.checkpointBranch}
                    {selectedRun.checkpointBaseBranch
                      ? ` (from ${selectedRun.checkpointBaseBranch})`
                      : ""}
                  </p>
                )}
                {selectedRun.checkpointError && (
                  <p className="warn">{selectedRun.checkpointError}</p>
                )}
                <div className="row">
                  <button
                    type="button"
                    className="ghost"
                    disabled={!token || rollbackBusy || !selectedRun.checkpointBranch}
                    onClick={() => void previewRollback()}
                  >
                    {rollbackBusy ? "Working..." : "Preview rollback"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!token || rollbackBusy || !selectedRun.checkpointBranch || !rollbackPreviewToken}
                    onClick={() => void executeRollback()}
                  >
                    Execute rollback
                  </button>
                </div>
                {!rollbackPreviewToken && <p className="pill">Run rollback preview before execute.</p>}
                {rollbackCommands && rollbackCommands.length > 0 && (
                  <pre className="run-pre">{rollbackCommands.join("\n")}</pre>
                )}
              </div>
            )}
            {selectedRun.pendingDecision && (
              <p className="warn">
                <strong>Pending decision:</strong> {selectedRun.pendingDecision.type} —{" "}
                {selectedRun.pendingDecision.reason}
              </p>
            )}
            {selectedRun.pendingDecision?.type === "provide_hint" && (
              <div className="pending-actions">
                <p>
                  <strong>Human-in-the-loop hint requested</strong>
                </p>
                {selectedRun.pendingDecision.suggestedHint && (
                  <p className="pill">Suggestion: {selectedRun.pendingDecision.suggestedHint}</p>
                )}
                <textarea
                  rows={3}
                  value={humanHint}
                  onChange={(e) => setHumanHint(e.target.value)}
                  placeholder="Hint for the agent (expected behavior, failing invariant, known root cause)"
                />
                <div className="row">
                  <button
                    type="button"
                    disabled={!token || runBusy}
                    onClick={() => void runAction("continue", { hint: humanHint.trim() })}
                  >
                    Submit hint and resume
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!token || runBusy}
                    onClick={() => void runAction("cancel")}
                  >
                    Manual override (stop loop)
                  </button>
                </div>
              </div>
            )}
            {selectedRun.pendingDecision?.type === "approve_transaction" && (
              <div className="tx-proposal">
                <p>
                  <strong>Transaction Proposal</strong>
                </p>
                <p>{selectedRun.pendingDecision.transaction.description}</p>
                <pre className="run-pre">
                  {JSON.stringify(selectedRun.pendingDecision.transaction, null, 2)}
                </pre>
                <button
                  type="button"
                  disabled={!token || runBusy}
                  onClick={() => void confirmTransaction()}
                >
                  Confirm in Wallet
                </button>
              </div>
            )}
            {selectedRun.pendingToolActions && selectedRun.pendingToolActions.length > 0 && (
              <div className="pending-actions">
                <p>
                  <strong>Pending actions requiring approval</strong>
                </p>
                <div className="risk-list">
                  {selectedRun.pendingToolActions.map((a, idx) => {
                    const fallbackRisk = assessActionRisk(a);
                    const risk = {
                      score: a.riskScore ?? fallbackRisk.score,
                      reason: a.riskReason ?? fallbackRisk.reason,
                      level: a.riskLevel ?? fallbackRisk.level,
                    };
                    const findPreview =
                      a.type === "write_file_patch"
                        ? a.find.length > 120
                          ? `${a.find.slice(0, 120)}...`
                          : a.find
                        : "";
                    return (
                      <div key={`${a.type}-${idx}`} className="risk-item">
                        <div className="row">
                          <p>
                            <strong>#{idx + 1}</strong> {a.type}
                          </p>
                          <span className={`risk-badge risk-${risk.level}`}>Risk {risk.score}/10</span>
                        </div>
                        <p className="pill">{risk.reason}</p>
                        {a.type === "run_command" ? (
                          <pre className="run-pre">{a.command}</pre>
                        ) : a.type === "propose_on_chain_tx" ? (
                          <pre className="run-pre">
                            {`network: ${a.network}\nto: ${a.to}\nvalue: ${a.value}\ndata: ${a.data.slice(0, 120)}${a.data.length > 120 ? "..." : ""}`}
                          </pre>
                        ) : a.type === "navigate_and_extract" ? (
                          <pre className="run-pre">
                            {`url: ${a.url}\nschema keys: ${Object.keys(a.schema || {}).join(", ") || "(none)"}`}
                          </pre>
                        ) : a.type === "retrieve_context" ? (
                          <pre className="run-pre">{`query: ${a.query}\nlimit: ${a.limit ?? 3}`}</pre>
                        ) : (
                          <pre className="run-pre">
                            {`path: ${a.path}\nfind: ${findPreview}`}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="row">
              <button type="button" disabled={!token || runBusy} onClick={() => void runAction("continue")}>
                Continue
              </button>
              <button type="button" className="ghost" disabled={!token || runBusy} onClick={() => void runAction("retry")}>
                Retry
              </button>
              <button type="button" className="ghost" disabled={!token || runBusy} onClick={() => void runAction("cancel")}>
                Cancel
              </button>
            </div>
            {researchCards.length > 0 && (
              <div className="timeline">
                <p>
                  <strong>Web Research</strong>
                </p>
                <div className="run-list">
                  {researchCards.map((card) => (
                    <div key={`research-${card.stepIndex}`} className="run-item">
                      <strong>Step #{card.stepIndex + 1} · {card.title}</strong>
                      <div className="pill">{card.url}</div>
                      <input
                        value={researchFileNames[card.stepIndex] || ""}
                        onChange={(e) =>
                          setResearchFileNames((prev) => ({
                            ...prev,
                            [card.stepIndex]: e.target.value,
                          }))
                        }
                        placeholder="filename (optional, e.g. competitor-pricing-apr-17)"
                      />
                      <button
                        type="button"
                        className="ghost"
                        disabled={!token || exportingResearchStep === card.stepIndex}
                        onClick={() => void exportResearch(card.stepIndex)}
                      >
                        {exportingResearchStep === card.stepIndex ? "Exporting..." : "Export JSON to file"}
                      </button>
                      <details className="timeline">
                        <summary>View extracted data</summary>
                        <pre className="run-pre">{card.payload}</pre>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedRun.steps && selectedRun.steps.length > 0 && (
              <pre className="run-pre">
                {selectedRun.steps
                  .map((s) => `#${s.index + 1} [${s.status}] (attempts: ${s.attempts}) ${s.title}${s.lastError ? `\n  error: ${s.lastError}` : ""}`)
                  .join("\n")}
              </pre>
            )}
            {selectedRun.tasks && selectedRun.tasks.length > 0 && (
              <div className="timeline">
                <p>
                  <strong>Swarm Task Tree</strong>
                  {swarmActive && (
                    <span className="swarm-badge">Swarm Active · {activeSwarmNodes.length} parallel</span>
                  )}
                </p>
                {dagGraph.nodes.length > 0 ? (
                  <div className="dag-graph-wrapper">
                    <ReactFlow
                      nodes={dagGraph.nodes.map((node) =>
                        node.id === focusedDagNodeId
                          ? {
                              ...node,
                              style: {
                                ...(node.style ?? {}),
                                boxShadow: "0 0 0 2px rgba(34,197,94,0.8)",
                              },
                            }
                          : node,
                      )}
                      edges={dagGraph.edges}
                      fitView
                      nodesDraggable={false}
                      nodesConnectable={false}
                      elementsSelectable={false}
                      zoomOnScroll={!compactDag}
                      panOnDrag={!compactDag}
                      onNodeClick={(_evt: MouseEvent, node: Node<DagNodeData>) =>
                        setFocusedDagNodeId(node.id)
                      }
                    >
                      <Controls showInteractive={false} />
                      <Background />
                    </ReactFlow>
                  </div>
                ) : (
                  <p className="pill">DAG graph becomes available after planning.</p>
                )}
                {swarmNodes.length > 0 && (
                  <div className="row">
                    <label className="filter-toggle">
                      <input
                        type="checkbox"
                        checked={hideCompletedSwarmNodes}
                        onChange={(e) => setHideCompletedSwarmNodes(e.target.checked)}
                      />
                      hide completed nodes
                    </label>
                    <label className="filter-toggle">
                      <input
                        type="checkbox"
                        checked={compactDag}
                        onChange={(e) => setCompactDag(e.target.checked)}
                      />
                      compact graph mode
                    </label>
                    <span className="pill">critical path edges are highlighted in orange</span>
                    <button
                      type="button"
                      className="ghost"
                      disabled={blockedDagNodes.length === 0}
                      onClick={jumpToNextBlockedNode}
                    >
                      Jump to next blocked node
                    </button>
                  </div>
                )}
                {focusedDagNode && (
                  <div className="dag-focus-card">
                    <p>
                      <strong>Focused node:</strong> {focusedDagNode.data.label.split("\n")[0]}
                    </p>
                    <p className="pill">status: {focusedDagNode.data.status}</p>
                    {focusedStep?.lastError && <pre className="run-pre">{focusedStep.lastError}</pre>}
                    {focusedStep?.lastOutput && !focusedStep.lastError && (
                      <pre className="run-pre">{focusedStep.lastOutput.slice(0, 500)}</pre>
                    )}
                  </div>
                )}
                {visibleSwarmNodes.length > 0 && (
                  <div className="swarm-grid">
                    {visibleSwarmNodes.map((node) => (
                      <div
                        key={`swarm-node-${node.idx}`}
                        className={`swarm-node swarm-${node.status}${swarmActive && node.status === "in_progress" ? " swarm-pulse" : ""}`}
                      >
                        <strong>#{node.idx + 1} {node.title}</strong>
                        <div className="pill">
                          [{node.worker}] [{node.type}]
                        </div>
                        <div className="pill">
                          deps: {node.deps.length > 0 ? node.deps.join(", ") : "none"}
                        </div>
                        <div className="pill">status: {node.status}</div>
                      </div>
                    ))}
                  </div>
                )}
                {swarmNodes.length > 0 && visibleSwarmNodes.length === 0 && (
                  <p className="pill">All nodes are completed.</p>
                )}
                <pre className="run-pre">
                  {selectedRun.tasks
                    .map((t, idx) => {
                      const deps = t.dependsOn.length > 0 ? ` <- ${t.dependsOn.join(", ")}` : "";
                      const parallelizable = t.dependsOn.length === 0 ? " | parallel-ready" : "";
                      return `${idx + 1}. [${t.worker}] [${t.type}] ${t.title}${deps}${parallelizable}`;
                    })
                    .join("\n")}
                </pre>
              </div>
            )}
            {selectedRun.logs && selectedRun.logs.length > 0 && (
              <div className="timeline">
                <p>
                  <strong>Timeline</strong>
                </p>
                <pre className="run-pre">
                  {selectedRun.logs
                    .slice(-24)
                    .map((entry) => {
                      const t = new Date(entry.at).toLocaleTimeString();
                      return `[${t}] ${entry.level.toUpperCase()} ${humanizeTimelineMessage(entry.message)}`;
                    })
                    .join("\n")}
                </pre>
              </div>
            )}
            <div className="timeline">
              <p>
                <strong>Shadow Terminal</strong>
              </p>
              <pre className="run-pre">
                {(selectedRun.logs ?? [])
                  .filter(
                    (entry) =>
                      /self-healing|verify|execution|error|failed|attempt/i.test(entry.message),
                  )
                  .slice(-30)
                  .map((entry) => {
                    const t = new Date(entry.at).toLocaleTimeString();
                    return `[${t}] ${entry.level.toUpperCase()} ${entry.message}`;
                  })
                  .join("\n") || "No terminal output yet."}
              </pre>
            </div>
            <div className="timeline">
              <p>
                <strong>Sandbox Preflight</strong>
              </p>
              <pre className="run-pre">
                {sandboxLogEvents.length > 0
                  ? sandboxLogEvents
                      .map((entry) => {
                        const t = new Date(entry.at).toLocaleTimeString();
                        return `[${t}] ${entry.level.toUpperCase()} ${entry.message}`;
                      })
                      .join("\n")
                  : "No sandbox preflight events yet."}
              </pre>
            </div>
            {selectedRun.steps && selectedRun.steps.some((s) => s.lastError) && (
              <div className="timeline">
                <p>
                  <strong>Recent Step Errors</strong>
                </p>
                {selectedRun.steps
                  .filter((s) => Boolean(s.lastError))
                  .slice(-3)
                  .map((s) => (
                    <details key={s.index}>
                      <summary>Step #{s.index + 1} error</summary>
                      <pre className="run-pre">{s.lastError}</pre>
                    </details>
                  ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel log">
        <h2>Log</h2>
        <pre>{log.join("\n") || "…"}</pre>
      </section>

      {mintModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-panel"
            role="dialog"
            aria-labelledby="mint-modal-title"
            aria-modal="true"
          >
            <h3 id="mint-modal-title">Mint to Gallery</h3>
            <p className="pill">
              Umbrella will generalize your mission into a reusable template with{" "}
              <code>{"{{VARIABLE}}"}</code> placeholders where possible.
            </p>
            <div className="row stack">
              <input
                value={mintName}
                onChange={(e) => setMintName(e.target.value)}
                placeholder="Blueprint name (optional)"
              />
              <textarea
                value={mintDescription}
                onChange={(e) => setMintDescription(e.target.value)}
                placeholder="Short description (required, min 8 characters)"
                rows={3}
              />
              <label className="filter-toggle">
                Category
                <select
                  value={mintCategory}
                  onChange={(e) => setMintCategory(e.target.value as GalleryBlueprint["category"])}
                >
                  <option value="growth">growth</option>
                  <option value="shopping">shopping</option>
                  <option value="support">support</option>
                  <option value="crypto">crypto</option>
                  <option value="devops">devops</option>
                </select>
              </label>
              <input
                value={mintIcon}
                onChange={(e) => setMintIcon(e.target.value)}
                placeholder="Icon (optional emoji)"
                maxLength={32}
              />
            </div>
            <div className="row">
              <button type="button" disabled={mintingBlueprint} onClick={() => void submitMintBlueprint()}>
                {mintingBlueprint ? "Minting…" : "Mint blueprint"}
              </button>
              <button type="button" className="ghost" disabled={mintingBlueprint} onClick={() => setMintModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
