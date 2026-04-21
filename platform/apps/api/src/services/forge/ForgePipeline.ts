import type { Abi } from "viem";

import {
  filterSwarmSteps,
  isForgeStep,
  parseOrchestratorPlan,
  type OrchestratorStep,
  dispatchToolPlanToSwarmCalls,
} from "../swarm/ActionDispatcher.js";
import { launchSwarm, type SwarmLaunchResult } from "../swarm/SwarmManager.js";
import { pollGemmaSoliditySecurityReview } from "../gemma/GemmaOrchestrator.js";
import { compileSolidityInTempProject, inferContractName, type CompiledArtifact } from "./CompilerService.js";
import { deployCompiledContract, type DeployCompiledResult } from "./ForgeDeploy.js";

export type ForgePipelineSwarmOpts = {
  chainId: number;
  staggerMs?: number;
  mnemonic?: string;
};

export type ForgePipelineResult = {
  securityReview?: { pass: boolean; notes: string; raw?: string };
  compiled?: CompiledArtifact;
  deployed?: DeployCompiledResult & { abi: Abi };
  contextPatch: Record<string, unknown>;
  swarm?: SwarmLaunchResult;
};

function skipSecurityEnv(): boolean {
  return process.env.UMBRELLA_FORGE_SKIP_SECURITY === "true";
}

/**
 * Walk orchestrator steps: optional write → (security) → compile → deploy, then optional swarm batch.
 */
export async function executeForgePipeline(opts: {
  steps: OrchestratorStep[];
  skipSecurityReview?: boolean;
  swarm?: ForgePipelineSwarmOpts;
}): Promise<ForgePipelineResult> {
  const { steps } = opts;
  const swarmSteps = filterSwarmSteps(steps);
  if (swarmSteps.length > 0 && !opts.swarm) {
    throw new Error(
      "Plan includes swarm steps — provide swarm: { chainId } or call POST /v1/swarm/dispatch with filterSwarmSteps(steps) only",
    );
  }

  let pendingSource: string | null = null;
  let pendingName: string | null = null;
  let compiled: CompiledArtifact | null = null;
  let securityReview: ForgePipelineResult["securityReview"];
  let deployed: (DeployCompiledResult & { abi: Abi }) | null = null;

  for (const step of steps) {
    if (!isForgeStep(step)) continue;

    if (step.tool === "write_solidity") {
      pendingSource = step.source;
      pendingName = step.contractName;
      compiled = null;
    }

    if (step.tool === "compile_solidity") {
      if (!pendingSource?.trim()) {
        throw new Error("compile_solidity requires a preceding write_solidity step");
      }
      const name = pendingName ?? inferContractName(pendingSource) ?? null;
      if (!name) {
        throw new Error("Could not infer contractName — add write_solidity with contractName");
      }

      const runSecurity = !opts.skipSecurityReview && !skipSecurityEnv();
      if (runSecurity) {
        const review = await pollGemmaSoliditySecurityReview(pendingSource);
        if (!review) {
          throw new Error(
            "Solidity security review requires GEMMA_VPS_URL, or set UMBRELLA_FORGE_SKIP_SECURITY=true for local dev",
          );
        }
        securityReview = { pass: review.pass, notes: review.notes, raw: review.raw };
        if (!review.pass) {
          throw new Error(`Security review rejected: ${review.notes}`);
        }
      }

      compiled = await compileSolidityInTempProject({
        source: pendingSource,
        contractName: name,
      });
    }

    if (step.tool === "deploy_contract") {
      if (!compiled) {
        throw new Error("deploy_contract requires a successful compile_solidity step before it");
      }
      const abi = compiled.abi as Abi;
      const dep = await deployCompiledContract({
        chainId: step.chainId,
        abi,
        bytecode: compiled.bytecode,
        constructorArgs: step.constructorArgs,
      });
      deployed = { ...dep, abi };
    }
  }

  const contextPatch: Record<string, unknown> = {};
  if (deployed) {
    contextPatch.CONTRACT_ADDRESS = deployed.contractAddress;
    contextPatch.DEPLOY_TX_HASH = deployed.transactionHash;
    contextPatch.EXPLORER_URL = deployed.explorerUrl;
    contextPatch.ABI = deployed.abi;
  }

  let swarm: SwarmLaunchResult | undefined;
  if (swarmSteps.length > 0 && opts.swarm) {
    const dispatched = dispatchToolPlanToSwarmCalls(swarmSteps);
    if (!dispatched.ok) {
      throw new Error(dispatched.error);
    }
    swarm = await launchSwarm({
      chainId: opts.swarm.chainId,
      callsPerAgent: dispatched.perAgentCalls,
      staggerMs: opts.swarm.staggerMs,
      mnemonic: opts.swarm.mnemonic,
    });
    contextPatch.SWARM = {
      agentCount: swarm.agentCount,
      smartAccountAddresses: swarm.smartAccountAddresses,
      userOpHashes: swarm.userOpHashes,
    };
  }

  return {
    securityReview,
    compiled: compiled ?? undefined,
    deployed: deployed ?? undefined,
    contextPatch,
    swarm,
  };
}

export async function executeForgePipelineFromBody(
  body: unknown,
  swarmFromBody?: ForgePipelineSwarmOpts,
): Promise<ForgePipelineResult> {
  const raw = body as Record<string, unknown>;
  const parsed = parseOrchestratorPlan(
    raw?.steps !== undefined ? body : { steps: Array.isArray(body) ? body : [] },
  );
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  if (!parsed.steps.some(isForgeStep)) {
    throw new Error("No forge steps (write_solidity / compile_solidity / deploy_contract) in plan");
  }
  const skipSecurityReview = raw?.skipSecurityReview === true;
  const swarm = swarmFromBody ?? (raw?.swarm as ForgePipelineSwarmOpts | undefined);
  return executeForgePipeline({
    steps: parsed.steps,
    skipSecurityReview,
    swarm,
  });
}
