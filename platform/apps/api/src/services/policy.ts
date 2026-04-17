import type { PendingToolAction } from "../store.js";
import { store, type PolicyProfile } from "../store.js";

export type PolicyEvaluation = {
  profile: PolicyProfile;
  outcome: "allow" | "blocked_for_signature" | "blocked";
  reason: string;
  highestRiskScore: number;
  filteredActions: PendingToolAction[];
};

export function defaultPolicyProfile(userId: string): PolicyProfile {
  return {
    id: `default-${userId}`,
    userId,
    version: 1,
    name: "default",
    riskBlockThreshold: Math.max(1, Math.min(10, Number(process.env.UMBRELLA_RISK_BLOCK_THRESHOLD ?? 7))),
    requireApprovalForProtectedWrites: process.env.UMBRELLA_RUN_REQUIRE_APPROVAL_FOR_PROTECTED_WRITES !== "false",
    requireApprovalForTransactions: true,
    allowedActionTypes: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function resolvePolicyProfile(userId: string): PolicyProfile {
  return store.findPolicyProfileByUser(userId) ?? defaultPolicyProfile(userId);
}

export function updatePolicyProfile(
  userId: string,
  patch: Partial<
    Pick<
      PolicyProfile,
      | "name"
      | "riskBlockThreshold"
      | "requireApprovalForProtectedWrites"
      | "requireApprovalForTransactions"
      | "allowedActionTypes"
    >
  >,
): PolicyProfile {
  const current = resolvePolicyProfile(userId);
  return store.upsertPolicyProfile({
    userId,
    version: current.version + 1,
    name: patch.name ?? current.name,
    riskBlockThreshold: Math.max(
      1,
      Math.min(10, patch.riskBlockThreshold ?? current.riskBlockThreshold),
    ),
    requireApprovalForProtectedWrites:
      patch.requireApprovalForProtectedWrites ?? current.requireApprovalForProtectedWrites,
    requireApprovalForTransactions:
      patch.requireApprovalForTransactions ?? current.requireApprovalForTransactions,
    allowedActionTypes: patch.allowedActionTypes ?? current.allowedActionTypes,
  });
}

export function evaluatePolicyForActions(
  profile: PolicyProfile,
  actions: PendingToolAction[],
): PolicyEvaluation {
  const allowedSet = profile.allowedActionTypes ? new Set(profile.allowedActionTypes) : null;
  const filtered = allowedSet ? actions.filter((a) => allowedSet.has(a.type)) : actions;
  const denied = allowedSet ? actions.filter((a) => !allowedSet.has(a.type)) : [];
  const highestRisk = filtered.reduce((max, a) => Math.max(max, a.riskScore ?? 0), 0);

  if (denied.length > 0) {
    return {
      profile,
      outcome: "blocked",
      reason: `Policy denied action type(s): ${[...new Set(denied.map((d) => d.type))].join(", ")}`,
      highestRiskScore: highestRisk,
      filteredActions: filtered,
    };
  }
  if (
    profile.requireApprovalForTransactions &&
    filtered.some((a) => a.type === "propose_on_chain_tx")
  ) {
    return {
      profile,
      outcome: "blocked_for_signature",
      reason: "Policy requires explicit approval for on-chain transactions.",
      highestRiskScore: Math.max(highestRisk, 10),
      filteredActions: filtered,
    };
  }
  if (highestRisk > profile.riskBlockThreshold) {
    return {
      profile,
      outcome: "blocked_for_signature",
      reason: `Risk score ${highestRisk}/10 exceeds policy threshold ${profile.riskBlockThreshold}.`,
      highestRiskScore: highestRisk,
      filteredActions: filtered,
    };
  }
  return {
    profile,
    outcome: "allow",
    reason: "Policy allows action batch.",
    highestRiskScore: highestRisk,
    filteredActions: filtered,
  };
}

export function recordPolicyDecision(input: {
  userId: string;
  runId?: string;
  stepIndex?: number;
  actions: PendingToolAction[];
  evaluation: PolicyEvaluation;
}): void {
  store.createPolicyDecisionTrail({
    userId: input.userId,
    runId: input.runId,
    stepIndex: input.stepIndex,
    profileVersion: input.evaluation.profile.version,
    policyName: input.evaluation.profile.name,
    actionTypes: [...new Set(input.actions.map((a) => a.type))],
    highestRiskScore: input.evaluation.highestRiskScore,
    outcome: input.evaluation.outcome,
    reason: input.evaluation.reason,
  });
}
