import { NextResponse } from "next/server";

import { runLaunch } from "@/lib/launch/orchestrator";
import { defaultLaunchChainId } from "@/lib/launch/chain-config";
import type { Address, Hex } from "viem";

export const runtime = "nodejs";

/**
 * POST /api/v1/forge/launch
 *
 * Kicks off the pump.fun-style launch pipeline. The client has already:
 *   1. Fetched `/launch/prepare` to get the factory + fee
 *   2. Signed + broadcast `factory.createAgentToken{value: fee}(...)` to
 *      deploy the ERC-20
 *   3. Signed an ERC-2612 permit granting the curveFactory allowance over
 *      the entire initialSupply
 *
 * The server now:
 *   A. Verifies the factory tx (extracts token address + blueprintId)
 *   B. Runs Kimi to generate the mission Solidity (with template fallback)
 *   C. Deploys an UmbrellaAgentMissionRecord pinning the Kimi hash on-chain
 *   D. Calls curveFactory.createCurveWithPermit to spin up the bonding curve
 *   E. Fires a Basescan verify in the background
 *
 * Returns once step (D) has confirmed so the client has a fully-tradable curve
 * address. Basescan verification continues in a background promise; the UI
 * polls `/launch/status/[hookId]` for step-by-step progress.
 */

type LaunchBody = {
  walletAddress?: string;
  factoryTxHash?: string;
  chainId?: number;
  identity?: { name?: string; symbol?: string; imageUrl?: string };
  mission?: { prompt?: string; category?: string };
  permit?: { deadline?: string | number; v?: number; r?: string; s?: string };
  forkedFrom?: string;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function sanitize(s: string | undefined, max = 512): string {
  return (s ?? "").toString().slice(0, max);
}

export async function POST(request: Request) {
  let body: LaunchBody;
  try {
    body = (await request.json()) as LaunchBody;
  } catch {
    return bad("invalid JSON body");
  }

  const wallet = sanitize(body.walletAddress, 64).trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return bad("walletAddress must be a 0x address");
  const factoryTxHash = sanitize(body.factoryTxHash, 80).trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(factoryTxHash)) {
    return bad("factoryTxHash must be a 0x 64-char hash");
  }
  const chainId = Number.isInteger(body.chainId) ? Number(body.chainId) : defaultLaunchChainId();

  const name = sanitize(body.identity?.name, 80).trim();
  const symbol = sanitize(body.identity?.symbol, 16).trim().toUpperCase();
  const imageUrl = sanitize(body.identity?.imageUrl, 512).trim();
  const prompt = sanitize(body.mission?.prompt, 2_000).trim();
  const category = sanitize(body.mission?.category, 32).trim() || "execution";
  if (name.length < 2) return bad("identity.name too short");
  if (symbol.length < 2) return bad("identity.symbol too short");
  if (prompt.length < 12) return bad("mission.prompt too short");

  const permit = body.permit;
  if (
    !permit ||
    typeof permit.v !== "number" ||
    typeof permit.r !== "string" ||
    typeof permit.s !== "string" ||
    (typeof permit.deadline !== "string" && typeof permit.deadline !== "number")
  ) {
    return bad("permit.{deadline,v,r,s} required");
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(permit.r) || !/^0x[a-fA-F0-9]{64}$/.test(permit.s)) {
    return bad("permit.r and permit.s must be 0x 64-char hex");
  }

  const forkedFromRaw = sanitize(body.forkedFrom, 40).trim();
  const forkedFrom = /^[0-9a-fA-F-]{32,40}$/.test(forkedFromRaw) ? forkedFromRaw : null;

  const composedPrompt = [
    `Agent: ${name} (${symbol})`,
    `Category: ${category}`,
    imageUrl ? `Branding: ${imageUrl}` : null,
    `Mission: ${prompt}`,
    "",
    "Write a production-ready Uniswap v4 Solidity hook that implements the",
    "behavior described above. Return only Solidity source code.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await runLaunch({
      chainId,
      walletAddress: wallet as Address,
      factoryTxHash: factoryTxHash as Hex,
      identity: { name, symbol, imageUrl },
      mission: { prompt, category },
      permit: {
        deadline: String(permit.deadline),
        v: permit.v,
        r: permit.r as Hex,
        s: permit.s as Hex,
      },
      forkedFrom,
      prompt: composedPrompt,
    });
    return NextResponse.json({ ok: true, launch: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "launch failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
