import { Hono } from "hono";
import { z } from "zod";
import { isAddress, type Abi, type Address } from "viem";

import { pollGemmaSoliditySecurityReview } from "../services/gemma/GemmaOrchestrator.js";
import { compileSolidityInTempProject, inferContractName } from "../services/forge/CompilerService.js";
import { deployCompiledContract } from "../services/forge/ForgeDeploy.js";
import {
  executeForgePipeline,
  executeForgePipelineFromBody,
} from "../services/forge/ForgePipeline.js";
import { poolObserverBundle } from "../services/v4/poolManagerAbi.js";
import { executeSovereignMission } from "../services/v4/SovereignMission.js";

export const forgeRoutes = new Hono();

const compileBodySchema = z.object({
  source: z.string().min(1).max(512_000),
  contractName: z.string().min(1).max(64).optional(),
  skipSecurityReview: z.boolean().optional(),
});

/**
 * POST /v1/forge/compile
 * forge build in a temp project (symlinked lib/). No deployment.
 */
forgeRoutes.post("/compile", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = compileBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  const name =
    parsed.data.contractName?.trim() ||
    inferContractName(parsed.data.source) ||
    null;
  if (!name) {
    return c.json({ error: "contractName_required", hint: "Set contractName or use a `contract Name` declaration" }, 400);
  }

  try {
    if (!parsed.data.skipSecurityReview && process.env.UMBRELLA_FORGE_SKIP_SECURITY !== "true") {
      const review = await pollGemmaSoliditySecurityReview(parsed.data.source);
      if (!review) {
        return c.json(
          {
            error: "security_review_unavailable",
            hint: "Set GEMMA_VPS_URL or pass skipSecurityReview: true / UMBRELLA_FORGE_SKIP_SECURITY=true",
          },
          503,
        );
      }
      if (!review.pass) {
        return c.json({ ok: false, error: "security_review_rejected", review }, 400);
      }
    }

    const compiled = await compileSolidityInTempProject({
      source: parsed.data.source,
      contractName: name,
    });

    return c.json({
      ok: true,
      contractName: compiled.contractName,
      abi: compiled.abi,
      bytecode: compiled.bytecode,
      poolObserver: poolObserverBundle,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});

const pipelineBodySchema = z.object({
  source: z.string().min(1).max(512_000),
  contractName: z.string().min(1).max(64).optional(),
  chainId: z.number().int(),
  constructorArgs: z.array(z.unknown()).optional(),
  skipSecurityReview: z.boolean().optional(),
  /** After deploy, initialize Uniswap v4 pool (token / WETH) + optional swarm seed (modify-liquidity preferred). */
  sovereignV4: z
    .object({
      enabled: z.boolean(),
      creator: z.string().refine((x) => isAddress(x), "creator").optional(),
      hook: z.string().refine((x) => isAddress(x), "hook").optional(),
      quoteToken: z.string().refine((x) => isAddress(x), "quoteToken").optional(),
      liquidityRouter: z.string().refine((x) => isAddress(x), "liquidityRouter").optional(),
      seedDonatePerAgent: z
        .object({
          agentCount: z.number().int().min(1).max(32),
          amount0Wei: z.string().regex(/^\d+$/),
          amount1Wei: z.string().regex(/^\d+$/),
          staggerMs: z.number().int().min(0).max(600_000).optional(),
        })
        .optional(),
      seedModifyLiquidityPerAgent: z
        .object({
          agentCount: z.number().int().min(1).max(32),
          tickLower: z.number().int(),
          tickUpper: z.number().int(),
          liquidityDelta: z.string().regex(/^-?\d+$/),
          salt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
          hookData: z
            .string()
            .refine(
              (x) => x === "0x" || (x.startsWith("0x") && x.length % 2 === 0),
              "hookData hex",
            )
            .optional(),
          staggerMs: z.number().int().min(0).max(600_000).optional(),
          thickLiquidity: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * POST /v1/forge/pipeline
 * Security (unless skipped) → compile → deploy relayer EOA. Returns `contextPatch` for Gemma follow-up.
 */
forgeRoutes.post("/pipeline", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = pipelineBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  const d = parsed.data;
  const name = d.contractName?.trim() || inferContractName(d.source) || null;
  if (!name) {
    return c.json({ error: "contractName_required" }, 400);
  }

  try {
    const steps = [
      { tool: "write_solidity" as const, contractName: name, source: d.source },
      { tool: "compile_solidity" as const },
      {
        tool: "deploy_contract" as const,
        chainId: d.chainId,
        constructorArgs: d.constructorArgs,
      },
    ];

    const result = await executeForgePipeline({
      steps,
      skipSecurityReview: d.skipSecurityReview === true,
    });

    let sovereignV4 = null;
    if (d.sovereignV4?.enabled && result.deployed?.contractAddress) {
      sovereignV4 = await executeSovereignMission({
        chainId: d.chainId,
        token: result.deployed.contractAddress as Address,
        creator: d.sovereignV4.creator as Address | undefined,
        hook: d.sovereignV4.hook as Address | undefined,
        quoteToken: d.sovereignV4.quoteToken as Address | undefined,
        liquidityRouter: d.sovereignV4.liquidityRouter as Address | undefined,
        seedDonatePerAgent: d.sovereignV4.seedDonatePerAgent
          ? {
              agentCount: d.sovereignV4.seedDonatePerAgent.agentCount,
              amount0Wei: BigInt(d.sovereignV4.seedDonatePerAgent.amount0Wei),
              amount1Wei: BigInt(d.sovereignV4.seedDonatePerAgent.amount1Wei),
              staggerMs: d.sovereignV4.seedDonatePerAgent.staggerMs,
            }
          : undefined,
        seedModifyLiquidityPerAgent: d.sovereignV4.seedModifyLiquidityPerAgent
          ? {
              agentCount: d.sovereignV4.seedModifyLiquidityPerAgent.agentCount,
              tickLower: d.sovereignV4.seedModifyLiquidityPerAgent.tickLower,
              tickUpper: d.sovereignV4.seedModifyLiquidityPerAgent.tickUpper,
              liquidityDelta: BigInt(d.sovereignV4.seedModifyLiquidityPerAgent.liquidityDelta),
              salt: d.sovereignV4.seedModifyLiquidityPerAgent.salt as `0x${string}`,
              hookData: d.sovereignV4.seedModifyLiquidityPerAgent.hookData as `0x${string}` | undefined,
              staggerMs: d.sovereignV4.seedModifyLiquidityPerAgent.staggerMs,
              thickLiquidity: d.sovereignV4.seedModifyLiquidityPerAgent.thickLiquidity,
            }
          : undefined,
      });
    }

    return c.json({
      ok: true,
      ...result,
      sovereignV4,
      message:
        "Fund swarm smart accounts for native ETH transfers; paymaster does not fund call value. v4: on CDP allowlist PoolManager, mission+quote tokens, UmbrellaV4Router (UMBRELLA_V4_LIQUIDITY_ROUTER), approve + modifyLiquidity selectors for sponsored swarm seeding.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});

const executePlanSchema = z.object({
  steps: z.array(z.unknown()),
  skipSecurityReview: z.boolean().optional(),
  swarm: z
    .object({
      chainId: z.number().int(),
      staggerMs: z.number().int().min(0).max(600_000).optional(),
      mnemonic: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /v1/forge/execute-plan
 * Full Gemma-shaped plan: write_solidity → compile_solidity → deploy_contract → optional swarm steps.
 */
forgeRoutes.post("/execute-plan", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = executePlanSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  try {
    const result = await executeForgePipelineFromBody(parsed.data);
    return c.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});

const deployOnlySchema = z.object({
  chainId: z.number().int(),
  abi: z.array(z.unknown()),
  bytecode: z.string().min(4),
  constructorArgs: z.array(z.unknown()).optional(),
});

/**
 * POST /v1/forge/deploy
 * Deploy already-compiled artifact (bytecode + abi JSON).
 */
forgeRoutes.post("/deploy", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = deployOnlySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  try {
    const deployed = await deployCompiledContract({
      chainId: parsed.data.chainId,
      abi: parsed.data.abi as Abi,
      bytecode: parsed.data.bytecode as `0x${string}`,
      constructorArgs: parsed.data.constructorArgs,
    });
    return c.json({
      ok: true,
      ...deployed,
      contextPatch: {
        CONTRACT_ADDRESS: deployed.contractAddress,
        DEPLOY_TX_HASH: deployed.transactionHash,
        EXPLORER_URL: deployed.explorerUrl,
        ABI: parsed.data.abi,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});
