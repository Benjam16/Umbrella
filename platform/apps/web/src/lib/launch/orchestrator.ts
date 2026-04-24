import { keccak256, toBytes, type Address, type Hex } from "viem";

import { generateHookWithKimi, insertGeneratedHook } from "@/lib/forge-hooks";
import {
  createCurveForToken,
  deployMissionRecord,
  verifyFactoryTx,
  encodeMissionRecordConstructorArgs,
  LaunchDeployerError,
} from "./deployer";
import { pollVerifyStatus, submitVerifyMissionRecord } from "./basescan";
import { recordLaunchStep, updateHookRow } from "./jobs";

/**
 * End-to-end orchestrator for the pump.fun-style launch flow. Runs
 * sequentially and writes progress into `launch_jobs` after every step so the
 * status panel can render exactly where the launch is, including failures.
 *
 * Steps:
 *   1. verify_factory_tx    — confirm the user deployed their token via our factory
 *   2. generate_hook        — Kimi produces mission Solidity (or template fallback)
 *   3. deploy_mission_record — server deploys the per-agent record contract
 *   4. create_curve         — server relays ERC-2612 permit to curve factory
 *   5. mark_active          — flip curve_stage='active' on generated_hooks row
 *   6. verify_basescan      — fire-and-forget Basescan verification
 */

export type OrchestratorInput = {
  chainId: number;
  walletAddress: Address;
  factoryTxHash: Hex;
  identity: { name: string; symbol: string; imageUrl: string };
  mission: { prompt: string; category: string };
  permit: {
    deadline: string;
    v: number;
    r: Hex;
    s: Hex;
  };
  forkedFrom?: string | null;
  prompt: string;
};

export type OrchestratorResult = {
  hookId: string;
  tokenAddress: Address;
  curveAddress: Address;
  hookAddress: Address;
};

export async function runLaunch(input: OrchestratorInput): Promise<OrchestratorResult> {
  // Step 1 — verify factory tx, get token address.
  await recordLaunchStep({
    hookId: null,
    step: "verify_factory_tx",
    status: "running",
    payload: { txHash: input.factoryTxHash },
  });
  const factory = await verifyFactoryTx({
    chainId: input.chainId,
    txHash: input.factoryTxHash,
    expectedDeployer: input.walletAddress,
  }).catch(async (err: unknown) => {
    await recordLaunchStep({
      hookId: null,
      step: "verify_factory_tx",
      status: "failed",
      error: errorMessage(err),
    });
    throw err;
  });

  const tokenAddress = factory.tokenAddress as Address;

  await recordLaunchStep({
    hookId: null,
    step: "verify_factory_tx",
    status: "completed",
    payload: { tokenAddress, blueprintId: factory.blueprintId },
  });

  // Step 2 — Kimi (or template fallback).
  await recordLaunchStep({
    hookId: null,
    step: "generate_hook",
    status: "running",
  });
  let kimi: { code: string; model: string };
  try {
    kimi = await generateHookWithKimi(input.prompt);
  } catch (err) {
    await recordLaunchStep({
      hookId: null,
      step: "generate_hook",
      status: "failed",
      error: errorMessage(err),
    });
    throw err;
  }
  await recordLaunchStep({
    hookId: null,
    step: "generate_hook",
    status: "completed",
    payload: { model: kimi.model },
  });

  // Persist the base hook row now so every subsequent step can link back.
  const hookRow = await insertGeneratedHook({
    walletAddress: input.walletAddress,
    txHash: input.factoryTxHash,
    chainId: input.chainId,
    prompt: input.prompt,
    solidityCode: kimi.code,
    model: kimi.model,
    forkedFrom: input.forkedFrom ?? null,
    tokenAddress,
    poolAddress: null,
    hookAddress: null,
  });

  await updateHookRow(hookRow.id, {
    curve_stage: "deploying",
    mission_code_hash: keccak256(toBytes(kimi.code)),
  });

  // Step 3 — deploy the mission record contract.
  await recordLaunchStep({
    hookId: hookRow.id,
    step: "deploy_mission_record",
    status: "running",
  });
  let missionRecord;
  try {
    missionRecord = await deployMissionRecord({
      chainId: input.chainId,
      creator: input.walletAddress,
      token: tokenAddress,
      missionCode: kimi.code,
      metadataURI: `supabase://generated_hooks/${hookRow.id}`,
      missionLabel: `${input.identity.name} · ${input.identity.symbol}`,
    });
  } catch (err) {
    await recordLaunchStep({
      hookId: hookRow.id,
      step: "deploy_mission_record",
      status: "failed",
      error: errorMessage(err),
    });
    await updateHookRow(hookRow.id, {
      curve_stage: "failed",
      deploy_error: errorMessage(err),
    });
    throw err;
  }
  await recordLaunchStep({
    hookId: hookRow.id,
    step: "deploy_mission_record",
    status: "completed",
    payload: {
      address: missionRecord.address,
      txHash: missionRecord.txHash,
      gasUsed: missionRecord.gasUsed.toString(),
    },
  });
  await updateHookRow(hookRow.id, {
    hook_address: missionRecord.address,
    metadata_uri: `supabase://generated_hooks/${hookRow.id}`,
  });

  // Step 4 — create the bonding curve using the user's permit signature.
  await recordLaunchStep({
    hookId: hookRow.id,
    step: "create_curve",
    status: "running",
  });
  let curve;
  try {
    curve = await createCurveForToken({
      chainId: input.chainId,
      tokenAddress,
      creator: input.walletAddress,
      hookAddress: missionRecord.address,
      tokensSeed: factory.initialSupply,
      permit: {
        deadline: BigInt(input.permit.deadline),
        v: input.permit.v,
        r: input.permit.r,
        s: input.permit.s,
      },
    });
  } catch (err) {
    await recordLaunchStep({
      hookId: hookRow.id,
      step: "create_curve",
      status: "failed",
      error: errorMessage(err),
    });
    await updateHookRow(hookRow.id, {
      curve_stage: "failed",
      deploy_error: errorMessage(err),
    });
    throw err;
  }
  await recordLaunchStep({
    hookId: hookRow.id,
    step: "create_curve",
    status: "completed",
    payload: {
      curveAddress: curve.curveAddress,
      txHash: curve.txHash,
      gasUsed: curve.gasUsed.toString(),
    },
  });
  await updateHookRow(hookRow.id, {
    curve_address: curve.curveAddress,
  });

  // Step 5 — flip to active so the marketplace + trade widget pick it up.
  await recordLaunchStep({
    hookId: hookRow.id,
    step: "mark_active",
    status: "running",
  });
  await updateHookRow(hookRow.id, { curve_stage: "active" });
  await recordLaunchStep({
    hookId: hookRow.id,
    step: "mark_active",
    status: "completed",
  });

  // Step 6 — Basescan verify, fire-and-forget.
  void verifyBasescanInBackground({
    hookId: hookRow.id,
    chainId: input.chainId,
    address: missionRecord.address,
    constructorArgsHex: encodeMissionRecordConstructorArgs({
      creator: input.walletAddress,
      token: tokenAddress,
      missionCodeHash: missionRecord.missionCodeHash,
      metadataURI: `supabase://generated_hooks/${hookRow.id}`,
      missionLabel: `${input.identity.name} · ${input.identity.symbol}`,
    }),
  });

  return {
    hookId: hookRow.id,
    tokenAddress,
    curveAddress: curve.curveAddress,
    hookAddress: missionRecord.address,
  };
}

async function verifyBasescanInBackground(args: {
  hookId: string;
  chainId: number;
  address: string;
  constructorArgsHex: string;
}) {
  try {
    await recordLaunchStep({
      hookId: args.hookId,
      step: "verify_basescan",
      status: "running",
    });
    const submit = await submitVerifyMissionRecord({
      chainId: args.chainId,
      address: args.address,
      constructorArgsHex: args.constructorArgsHex,
    });
    if (submit.state === "skipped") {
      await recordLaunchStep({
        hookId: args.hookId,
        step: "verify_basescan",
        status: "completed",
        payload: { skipped: submit.reason },
      });
      return;
    }
    if (submit.state === "failed") {
      await recordLaunchStep({
        hookId: args.hookId,
        step: "verify_basescan",
        status: "failed",
        error: submit.message,
      });
      return;
    }
    if (submit.state === "verified") {
      await updateHookRow(args.hookId, { verified_at: new Date().toISOString() });
      await recordLaunchStep({
        hookId: args.hookId,
        step: "verify_basescan",
        status: "completed",
        payload: { preverified: true },
      });
      return;
    }

    await updateHookRow(args.hookId, { verify_guid: submit.guid });
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      const status = await pollVerifyStatus({ chainId: args.chainId, guid: submit.guid });
      if (status.state === "verified") {
        await updateHookRow(args.hookId, { verified_at: new Date().toISOString() });
        await recordLaunchStep({
          hookId: args.hookId,
          step: "verify_basescan",
          status: "completed",
          payload: { guid: submit.guid, message: status.message },
        });
        return;
      }
      if (status.state === "failed") {
        await recordLaunchStep({
          hookId: args.hookId,
          step: "verify_basescan",
          status: "failed",
          error: status.message,
        });
        return;
      }
    }
    await recordLaunchStep({
      hookId: args.hookId,
      step: "verify_basescan",
      status: "failed",
      error: "timed out waiting for Basescan verification",
    });
  } catch (err) {
    await recordLaunchStep({
      hookId: args.hookId,
      step: "verify_basescan",
      status: "failed",
      error: errorMessage(err),
    });
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof LaunchDeployerError) return `[${err.step}] ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
