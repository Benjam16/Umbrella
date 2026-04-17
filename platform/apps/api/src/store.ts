import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { PlannedTask, TransactionProposal } from "@umbrella/shared";

export type User = {
  id: string;
  email: string;
  role: "owner" | "admin" | "operator" | "analyst";
  credits: number;
  createdAt: string;
};

export type RunStatus =
  | "queued"
  | "planning"
  | "executing"
  | "verifying"
  | "blocked"
  | "blocked_for_human"
  | "blocked_for_signature"
  | "completed"
  | "failed"
  | "cancelled";

export type RunStep = {
  index: number;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  attempts: number;
  lastError?: string;
  lastOutput?: string;
};

export type RunLogEntry = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
};

export type PendingDecision =
  | {
      type: "approve_risky_step";
      stepIndex: number;
      reason: string;
    }
  | {
      type: "retry_or_cancel";
      stepIndex: number;
      reason: string;
    }
  | {
      type: "provide_hint";
      stepIndex: number;
      reason: string;
      suggestedHint?: string;
    }
  | {
      type: "approve_transaction";
      stepIndex: number;
      reason: string;
      transaction: TransactionProposal;
    };

export type PendingToolAction =
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
    };

export type TaskRun = {
  id: string;
  userId: string;
  objective: string;
  missionSource?: "manual" | "blueprint";
  status: RunStatus;
  requestedModel?: string;
  modelUsed?: string;
  routeReason?: string;
  policyProfileName?: string;
  policyProfileVersion?: number;
  reasoningTrace?: string;
  outcomeSummary?: string[];
  maxCredits: number;
  maxSteps: number;
  maxMinutes: number;
  maxAutoFixes: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  creditsCharged: number;
  steps: RunStep[];
  logs: RunLogEntry[];
  tasks?: PlannedTask[];
  checkpointBranch?: string;
  checkpointBaseBranch?: string;
  checkpointCreatedAt?: string;
  checkpointStatus?: "created" | "skipped" | "failed";
  checkpointError?: string;
  rollbackPreviewToken?: string;
  rollbackPreviewAt?: string;
  pendingDecision?: PendingDecision;
  pendingToolActions?: PendingToolAction[];
};

export type SiteWatchThresholds = {
  minItems?: number;
  mustIncludeText?: string;
  maxHoursBetweenTriggers?: number;
};

export type SiteWatchAlerts = {
  enabled: boolean;
  webhookUrl?: string;
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
};

export type SiteWatch = {
  id: string;
  userId: string;
  name: string;
  target: {
    url: string;
    goal: string;
    fields: string[];
    maxItems: number;
  };
  triggerObjective: string;
  thresholds: SiteWatchThresholds;
  alerts: SiteWatchAlerts;
  active: boolean;
  lastTriggeredAt?: string;
  lastFingerprint?: string;
  lastCheckAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type MintedBlueprint = {
  id: string;
  userId: string;
  name: string;
  description: string;
  initialMission: string;
  suggestedMaxCredits: number;
  category: "shopping" | "growth" | "support" | "crypto" | "devops";
  suggestedFilenames: string[];
  sourceRunId: string;
  /** Optional emoji or short label for gallery cards */
  icon?: string;
  /** Placeholder keys matching `{{KEY}}` in `initialMission` (for UI injection). */
  missionVariables?: string[];
  createdAt: string;
  updatedAt: string;
};

export type MemoryEntry = {
  id: string;
  userId: string;
  runId?: string;
  source: "run_log" | "run_step" | "research" | "summary" | "manual";
  text: string;
  tags: string[];
  vector?: number[];
  createdAt: string;
};

export type PolicyProfile = {
  id: string;
  userId: string;
  version: number;
  name: string;
  riskBlockThreshold: number;
  requireApprovalForProtectedWrites: boolean;
  requireApprovalForTransactions: boolean;
  allowedActionTypes?: Array<
    "run_command" | "write_file_patch" | "navigate_and_extract" | "propose_on_chain_tx" | "retrieve_context"
  >;
  updatedAt: string;
};

export type PolicyDecisionTrail = {
  id: string;
  userId: string;
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

export type OutreachTarget = {
  id: string;
  channel: "email" | "webhook" | "linkedin";
  address: string;
  variables?: Record<string, string>;
};

export type OutreachCampaign = {
  id: string;
  userId: string;
  name: string;
  objective: string;
  messageTemplate: string;
  targets: OutreachTarget[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OutreachDispatch = {
  id: string;
  userId: string;
  campaignId: string;
  status: "queued" | "sending" | "completed" | "failed";
  sent: number;
  failed: number;
  logs: Array<{ at: string; level: "info" | "warn" | "error"; message: string }>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type AuditEvent = {
  id: string;
  userId?: string;
  userRole?: User["role"];
  method: string;
  path: string;
  requestPreview?: string;
  status: number;
  ip?: string;
  latencyMs: number;
  createdAt: string;
};

export type BackupSnapshot = {
  id: string;
  createdAt: string;
  createdByUserId?: string;
  path: string;
  sizeBytes: number;
  checksumSha256?: string;
  encrypted: boolean;
  reason?: string;
};

type Persisted = {
  users: User[];
  /** bearer token -> userId */
  tokens: Record<string, string>;
  runs: TaskRun[];
  siteWatches: SiteWatch[];
  mintedBlueprints: MintedBlueprint[];
  memoryEntries: MemoryEntry[];
  policyProfiles: PolicyProfile[];
  policyDecisions: PolicyDecisionTrail[];
  outreachCampaigns: OutreachCampaign[];
  outreachDispatches: OutreachDispatch[];
  auditEvents: AuditEvent[];
  backupSnapshots: BackupSnapshot[];
};

const defaultPersisted = (): Persisted => ({
  users: [],
  tokens: {},
  runs: [],
  siteWatches: [],
  mintedBlueprints: [],
  memoryEntries: [],
  policyProfiles: [],
  policyDecisions: [],
  outreachCampaigns: [],
  outreachDispatches: [],
  auditEvents: [],
  backupSnapshots: [],
});

function dataPath(): string {
  const root = process.env.UMBRELLA_DATA_DIR ?? join(process.cwd(), "data");
  return join(root, "store.json");
}

function encryptionKey(): Buffer | null {
  const raw = process.env.UMBRELLA_STORE_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  return scryptSync(raw, "umbrella-store-salt-v1", 32);
}

function encryptJson(plain: string): string {
  const key = encryptionKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return `enc:v1:${packed}`;
}

function decryptJson(input: string): string {
  const key = encryptionKey();
  if (!input.startsWith("enc:v1:")) return input;
  if (!key) throw new Error("store_encrypted_but_no_key_configured");
  const raw = Buffer.from(input.slice("enc:v1:".length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString("utf8");
}

function load(): Persisted {
  const path = dataPath();
  if (!existsSync(path)) return defaultPersisted();
  try {
    const raw = readFileSync(path, "utf-8");
    const decoded = decryptJson(raw);
    const parsed = JSON.parse(decoded) as Persisted;
    if (!parsed.users || !parsed.tokens) return defaultPersisted();
    parsed.users = parsed.users.map((u) => ({
      ...u,
      role: u.role ?? "operator",
    }));
    if (!Array.isArray(parsed.runs)) parsed.runs = [];
    if (!Array.isArray(parsed.siteWatches)) parsed.siteWatches = [];
    if (!Array.isArray(parsed.mintedBlueprints)) parsed.mintedBlueprints = [];
    if (!Array.isArray(parsed.memoryEntries)) parsed.memoryEntries = [];
    if (!Array.isArray(parsed.policyProfiles)) parsed.policyProfiles = [];
    if (!Array.isArray(parsed.policyDecisions)) parsed.policyDecisions = [];
    if (!Array.isArray(parsed.outreachCampaigns)) parsed.outreachCampaigns = [];
    if (!Array.isArray(parsed.outreachDispatches)) parsed.outreachDispatches = [];
    if (!Array.isArray(parsed.auditEvents)) parsed.auditEvents = [];
    if (!Array.isArray(parsed.backupSnapshots)) parsed.backupSnapshots = [];
    return parsed;
  } catch {
    return defaultPersisted();
  }
}

function save(data: Persisted): void {
  const path = dataPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  writeFileSync(tmp, encryptJson(payload), "utf-8");
  renameSync(tmp, path);
}

export const store = {
  path: dataPath,

  listUsers(): User[] {
    return load().users;
  },

  findUserById(id: string): User | undefined {
    return load().users.find((u) => u.id === id);
  },

  findUserByEmail(email: string): User | undefined {
    const needle = email.trim().toLowerCase();
    return load().users.find((u) => u.email.trim().toLowerCase() === needle);
  },

  findUserByToken(token: string): User | undefined {
    const data = load();
    const userId = data.tokens[token];
    if (!userId) return undefined;
    return data.users.find((u) => u.id === userId);
  },

  createUser(
    email: string,
    startingCredits: number,
    roleOverride?: User["role"],
  ): { user: User; token: string } {
    const data = load();
    const id = randomBytes(16).toString("hex");
    const token = randomBytes(32).toString("hex");
    const user: User = {
      id,
      email,
      role:
        roleOverride ??
        (data.users.length === 0
          ? "owner"
          : (process.env.UMBRELLA_DEFAULT_USER_ROLE as User["role"] | undefined) ?? "operator"),
      credits: startingCredits,
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    data.tokens[token] = id;
    save(data);
    return { user, token };
  },

  adjustCredits(userId: string, delta: number): User | undefined {
    const data = load();
    const user = data.users.find((u) => u.id === userId);
    if (!user) return undefined;
    user.credits += delta;
    save(data);
    return user;
  },

  createRun(
    input: Omit<TaskRun, "id" | "startedAt" | "updatedAt" | "logs" | "steps" | "creditsCharged"> & {
      steps?: RunStep[];
      logs?: RunLogEntry[];
      creditsCharged?: number;
    },
  ): TaskRun {
    const data = load();
    const now = new Date().toISOString();
    const run: TaskRun = {
      id: randomBytes(12).toString("hex"),
      userId: input.userId,
      objective: input.objective,
      missionSource: input.missionSource,
      status: input.status,
      requestedModel: input.requestedModel,
      modelUsed: input.modelUsed,
      routeReason: input.routeReason,
      policyProfileName: input.policyProfileName,
      policyProfileVersion: input.policyProfileVersion,
      outcomeSummary: input.outcomeSummary,
      maxCredits: input.maxCredits,
      maxSteps: input.maxSteps,
      maxMinutes: input.maxMinutes,
      maxAutoFixes: input.maxAutoFixes,
      startedAt: now,
      updatedAt: now,
      completedAt: input.completedAt,
      creditsCharged: input.creditsCharged ?? 0,
      steps: input.steps ?? [],
      logs: input.logs ?? [],
      pendingDecision: input.pendingDecision,
    };
    data.runs.push(run);
    save(data);
    return run;
  },

  listRunsByUser(userId: string): TaskRun[] {
    return load()
      .runs.filter((r) => r.userId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },

  listRunsByStatuses(statuses: RunStatus[]): TaskRun[] {
    const wanted = new Set(statuses);
    return load()
      .runs.filter((r) => wanted.has(r.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  findRunById(runId: string): TaskRun | undefined {
    return load().runs.find((r) => r.id === runId);
  },

  updateRun(runId: string, updater: (run: TaskRun) => void): TaskRun | undefined {
    const data = load();
    const run = data.runs.find((r) => r.id === runId);
    if (!run) return undefined;
    updater(run);
    run.updatedAt = new Date().toISOString();
    save(data);
    return run;
  },

  createSiteWatch(input: Omit<SiteWatch, "id" | "createdAt" | "updatedAt">): SiteWatch {
    const data = load();
    const now = new Date().toISOString();
    const watch: SiteWatch = {
      id: randomBytes(12).toString("hex"),
      userId: input.userId,
      name: input.name,
      target: input.target,
      triggerObjective: input.triggerObjective,
      thresholds: input.thresholds,
      alerts: input.alerts,
      active: input.active,
      lastTriggeredAt: input.lastTriggeredAt,
      lastFingerprint: input.lastFingerprint,
      lastCheckAt: input.lastCheckAt,
      createdAt: now,
      updatedAt: now,
    };
    data.siteWatches.push(watch);
    save(data);
    return watch;
  },

  listSiteWatchesByUser(userId: string): SiteWatch[] {
    return load()
      .siteWatches.filter((w) => w.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  listActiveSiteWatches(): SiteWatch[] {
    return load()
      .siteWatches.filter((w) => w.active)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  findSiteWatchById(id: string): SiteWatch | undefined {
    return load().siteWatches.find((w) => w.id === id);
  },

  updateSiteWatch(id: string, updater: (watch: SiteWatch) => void): SiteWatch | undefined {
    const data = load();
    const watch = data.siteWatches.find((w) => w.id === id);
    if (!watch) return undefined;
    updater(watch);
    watch.updatedAt = new Date().toISOString();
    save(data);
    return watch;
  },

  deleteSiteWatch(id: string): boolean {
    const data = load();
    const before = data.siteWatches.length;
    data.siteWatches = data.siteWatches.filter((w) => w.id !== id);
    if (data.siteWatches.length === before) return false;
    save(data);
    return true;
  },

  listMintedBlueprints(): MintedBlueprint[] {
    return load()
      .mintedBlueprints.slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  listMintedBlueprintsByUser(userId: string): MintedBlueprint[] {
    return load()
      .mintedBlueprints.filter((b) => b.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  createMintedBlueprint(input: Omit<MintedBlueprint, "id" | "createdAt" | "updatedAt">): MintedBlueprint {
    const data = load();
    const now = new Date().toISOString();
    const blueprint: MintedBlueprint = {
      id: randomBytes(12).toString("hex"),
      userId: input.userId,
      name: input.name,
      description: input.description,
      initialMission: input.initialMission,
      suggestedMaxCredits: input.suggestedMaxCredits,
      category: input.category,
      suggestedFilenames: input.suggestedFilenames,
      sourceRunId: input.sourceRunId,
      icon: input.icon,
      missionVariables: input.missionVariables,
      createdAt: now,
      updatedAt: now,
    };
    data.mintedBlueprints.push(blueprint);
    save(data);
    return blueprint;
  },

  createMemoryEntry(input: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
    const data = load();
    const entry: MemoryEntry = {
      id: randomBytes(12).toString("hex"),
      userId: input.userId,
      runId: input.runId,
      source: input.source,
      text: input.text,
      tags: input.tags,
      createdAt: new Date().toISOString(),
    };
    data.memoryEntries.push(entry);
    const max = Math.max(200, Number(process.env.UMBRELLA_MEMORY_MAX_ENTRIES ?? 5000));
    if (data.memoryEntries.length > max) {
      data.memoryEntries = data.memoryEntries
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, max);
    }
    save(data);
    return entry;
  },

  listMemoryEntriesByUser(userId: string): MemoryEntry[] {
    return load()
      .memoryEntries.filter((e) => e.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  findPolicyProfileByUser(userId: string): PolicyProfile | undefined {
    return load().policyProfiles.find((p) => p.userId === userId);
  },

  upsertPolicyProfile(
    input: Omit<PolicyProfile, "id" | "updatedAt"> & { id?: string },
  ): PolicyProfile {
    const data = load();
    const now = new Date().toISOString();
    const existing = data.policyProfiles.find((p) => p.userId === input.userId);
    if (existing) {
      existing.version = input.version;
      existing.name = input.name;
      existing.riskBlockThreshold = input.riskBlockThreshold;
      existing.requireApprovalForProtectedWrites = input.requireApprovalForProtectedWrites;
      existing.requireApprovalForTransactions = input.requireApprovalForTransactions;
      existing.allowedActionTypes = input.allowedActionTypes;
      existing.updatedAt = now;
      save(data);
      return existing;
    }
    const created: PolicyProfile = {
      id: input.id ?? randomBytes(12).toString("hex"),
      userId: input.userId,
      version: input.version,
      name: input.name,
      riskBlockThreshold: input.riskBlockThreshold,
      requireApprovalForProtectedWrites: input.requireApprovalForProtectedWrites,
      requireApprovalForTransactions: input.requireApprovalForTransactions,
      allowedActionTypes: input.allowedActionTypes,
      updatedAt: now,
    };
    data.policyProfiles.push(created);
    save(data);
    return created;
  },

  createPolicyDecisionTrail(
    input: Omit<PolicyDecisionTrail, "id" | "createdAt">,
  ): PolicyDecisionTrail {
    const data = load();
    const entry: PolicyDecisionTrail = {
      id: randomBytes(12).toString("hex"),
      userId: input.userId,
      runId: input.runId,
      stepIndex: input.stepIndex,
      profileVersion: input.profileVersion,
      policyName: input.policyName,
      actionTypes: input.actionTypes,
      highestRiskScore: input.highestRiskScore,
      outcome: input.outcome,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    };
    data.policyDecisions.push(entry);
    const max = Math.max(500, Number(process.env.UMBRELLA_POLICY_DECISION_MAX ?? 10000));
    if (data.policyDecisions.length > max) {
      data.policyDecisions = data.policyDecisions
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, max);
    }
    save(data);
    return entry;
  },

  listPolicyDecisionsByUser(userId: string): PolicyDecisionTrail[] {
    return load()
      .policyDecisions.filter((d) => d.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  createOutreachCampaign(
    input: Omit<OutreachCampaign, "id" | "createdAt" | "updatedAt">,
  ): OutreachCampaign {
    const data = load();
    const now = new Date().toISOString();
    const campaign: OutreachCampaign = {
      id: randomBytes(12).toString("hex"),
      userId: input.userId,
      name: input.name,
      objective: input.objective,
      messageTemplate: input.messageTemplate,
      targets: input.targets,
      active: input.active,
      createdAt: now,
      updatedAt: now,
    };
    data.outreachCampaigns.push(campaign);
    save(data);
    return campaign;
  },

  listOutreachCampaignsByUser(userId: string): OutreachCampaign[] {
    return load()
      .outreachCampaigns.filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  findOutreachCampaignById(id: string): OutreachCampaign | undefined {
    return load().outreachCampaigns.find((c) => c.id === id);
  },

  updateOutreachCampaign(
    id: string,
    updater: (campaign: OutreachCampaign) => void,
  ): OutreachCampaign | undefined {
    const data = load();
    const campaign = data.outreachCampaigns.find((c) => c.id === id);
    if (!campaign) return undefined;
    updater(campaign);
    campaign.updatedAt = new Date().toISOString();
    save(data);
    return campaign;
  },

  createOutreachDispatch(
    input: Omit<OutreachDispatch, "id" | "createdAt" | "updatedAt" | "logs" | "sent" | "failed"> & {
      logs?: OutreachDispatch["logs"];
      sent?: number;
      failed?: number;
    },
  ): OutreachDispatch {
    const data = load();
    const now = new Date().toISOString();
    const dispatch: OutreachDispatch = {
      id: randomBytes(12).toString("hex"),
      userId: input.userId,
      campaignId: input.campaignId,
      status: input.status,
      sent: input.sent ?? 0,
      failed: input.failed ?? 0,
      logs: input.logs ?? [],
      createdAt: now,
      updatedAt: now,
      completedAt: input.completedAt,
    };
    data.outreachDispatches.push(dispatch);
    save(data);
    return dispatch;
  },

  listOutreachDispatchesByUser(userId: string): OutreachDispatch[] {
    return load()
      .outreachDispatches.filter((d) => d.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  findOutreachDispatchById(id: string): OutreachDispatch | undefined {
    return load().outreachDispatches.find((d) => d.id === id);
  },

  updateOutreachDispatch(
    id: string,
    updater: (dispatch: OutreachDispatch) => void,
  ): OutreachDispatch | undefined {
    const data = load();
    const dispatch = data.outreachDispatches.find((d) => d.id === id);
    if (!dispatch) return undefined;
    updater(dispatch);
    dispatch.updatedAt = new Date().toISOString();
    save(data);
    return dispatch;
  },

  createAuditEvent(input: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
    const data = load();
    const event: AuditEvent = {
      id: randomBytes(12).toString("hex"),
      userId: input.userId,
      userRole: input.userRole,
      method: input.method,
      path: input.path,
      requestPreview: input.requestPreview,
      status: input.status,
      ip: input.ip,
      latencyMs: input.latencyMs,
      createdAt: new Date().toISOString(),
    };
    data.auditEvents.push(event);
    const max = Math.max(1000, Number(process.env.UMBRELLA_AUDIT_MAX_EVENTS ?? 20000));
    if (data.auditEvents.length > max) {
      data.auditEvents = data.auditEvents
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, max);
    }
    save(data);
    return event;
  },

  listAuditEventsByUser(userId: string, limit = 200): AuditEvent[] {
    const safeLimit = Math.max(1, Math.min(1000, limit));
    return load()
      .auditEvents.filter((e) => e.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit);
  },

  createBackupSnapshot(input: Omit<BackupSnapshot, "id" | "createdAt">): BackupSnapshot {
    const data = load();
    const snapshot: BackupSnapshot = {
      id: randomBytes(12).toString("hex"),
      createdAt: new Date().toISOString(),
      createdByUserId: input.createdByUserId,
      path: input.path,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      encrypted: input.encrypted,
      reason: input.reason,
    };
    data.backupSnapshots.push(snapshot);
    const max = Math.max(10, Number(process.env.UMBRELLA_BACKUP_MAX_SNAPSHOTS ?? 120));
    if (data.backupSnapshots.length > max) {
      data.backupSnapshots = data.backupSnapshots
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, max);
    }
    save(data);
    return snapshot;
  },

  listBackupSnapshots(limit = 100): BackupSnapshot[] {
    const safeLimit = Math.max(1, Math.min(1000, limit));
    return load()
      .backupSnapshots.slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit);
  },

  findBackupSnapshotById(id: string): BackupSnapshot | undefined {
    return load().backupSnapshots.find((s) => s.id === id);
  },
};
