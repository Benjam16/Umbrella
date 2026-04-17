import type { ToolAction } from "./tool-executor.js";
import type { PendingToolAction } from "../store.js";

export type RiskLevel = "low" | "medium" | "high";

export type RiskAssessment = {
  action: ToolAction;
  score: number;
  reason: string;
  level: RiskLevel;
};

const HIGH_RISK_PATTERNS = /\b(rm\s+-rf|drop\s+table|truncate|shutdown|reboot|deploy|production|secret|private[_-]?key)\b/i;
const SENSITIVE_URL_PATTERNS = /\b(login|checkout|account)\b/i;

export function scoreToolActionRisk(action: ToolAction): RiskAssessment {
  if (action.type === "propose_on_chain_tx") {
    return {
      action,
      score: 10,
      reason: "This action proposes an on-chain transaction that can move funds.",
      level: "high",
    };
  }
  if (action.type === "navigate_and_extract") {
    if (SENSITIVE_URL_PATTERNS.test(action.url)) {
      return {
        action,
        score: 5,
        reason: "Scraping target includes authentication or account context.",
        level: "medium",
      };
    }
    return {
      action,
      score: 2,
      reason: "Read-only web observation action.",
      level: "low",
    };
  }
  if (action.type === "retrieve_context") {
    return {
      action,
      score: 1,
      reason: "Reads previously stored local memory context only.",
      level: "low",
    };
  }
  if (action.type === "run_command") {
    const command = action.command.trim();
    if (HIGH_RISK_PATTERNS.test(command)) {
      return {
        action,
        score: 9,
        reason: "Command matches high-risk destructive/production pattern.",
        level: "high",
      };
    }
    if (/\b(test|build|lint|format)\b/i.test(command)) {
      return { action, score: 2, reason: "Verification/build command is low risk.", level: "low" };
    }
    return { action, score: 5, reason: "General shell command with moderate uncertainty.", level: "medium" };
  }
  const path = action.path.toLowerCase();
  if (path.includes(".env") || path.includes("secret") || path.includes("key")) {
    return {
      action,
      score: 8,
      reason: "Patch targets sensitive config/credential-like file.",
      level: "high",
    };
  }
  if (path.includes("package.json") || path.includes("docker") || path.includes("infra")) {
    return {
      action,
      score: 7,
      reason: "Patch affects runtime/build/infrastructure surface.",
      level: "medium",
    };
  }
  return { action, score: 4, reason: "Application file patch with moderate impact.", level: "medium" };
}

export function highestRisk(actions: ToolAction[]): RiskAssessment | null {
  if (actions.length === 0) return null;
  return actions
    .map(scoreToolActionRisk)
    .sort((a, b) => b.score - a.score)[0]!;
}

export function annotateToolActionsWithRisk(actions: ToolAction[]): PendingToolAction[] {
  return actions.map((action) => {
    const risk = scoreToolActionRisk(action);
    return {
      ...action,
      riskScore: risk.score,
      riskReason: risk.reason,
      riskLevel: risk.level,
    };
  });
}
