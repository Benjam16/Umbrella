import { NextResponse } from "next/server";
import {
  generateHookWithKimi,
  insertGeneratedHook,
  verifyPaymentFromWebhook,
} from "@/lib/forge-hooks";

export const runtime = "nodejs";

type LaunchBody = {
  identity?: {
    name?: string;
    symbol?: string;
    imageUrl?: string;
  };
  mission?: {
    prompt?: string;
    category?: string;
  };
  walletAddress?: string;
  txHash?: string;
  chainId?: number;
  /** Hook id this launch was forked from (via Marketplace "Fork"). */
  forkedFrom?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

function sanitize(s: string | undefined, max = 512): string {
  return (s ?? "").toString().slice(0, max);
}

export async function POST(request: Request) {
  let body: LaunchBody;
  try {
    body = (await request.json()) as LaunchBody;
  } catch {
    return badRequest("invalid JSON body");
  }

  const wallet = sanitize(body.walletAddress, 64).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return badRequest("walletAddress must be a 0x 40-char address");
  }
  const name = sanitize(body.identity?.name, 80).trim();
  const symbol = sanitize(body.identity?.symbol, 16).trim().toUpperCase();
  const imageUrl = sanitize(body.identity?.imageUrl, 512).trim();
  const prompt = sanitize(body.mission?.prompt, 2_000).trim();
  const category = sanitize(body.mission?.category, 32).trim() || "execution";
  const txHash = sanitize(body.txHash, 80).trim();
  const defaultForgeChainId = Number(process.env.UMBRELLA_FORGE_CHAIN_ID?.trim() ?? "84532");
  const chainId = Number.isInteger(body.chainId) ? Number(body.chainId) : defaultForgeChainId;
  const forkedFromRaw = sanitize(body.forkedFrom, 40).trim();
  const forkedFrom = /^[0-9a-fA-F-]{32,40}$/.test(forkedFromRaw)
    ? forkedFromRaw
    : null;

  if (name.length < 2) return badRequest("identity.name too short");
  if (symbol.length < 2) return badRequest("identity.symbol too short");
  if (prompt.length < 12) return badRequest("mission.prompt too short");
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return badRequest("payment required: txHash must be a 0x 64-char hash");
  }

  const composed = [
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
    const payment = await verifyPaymentFromWebhook({ txHash }, { chainId });
    if (payment.from.toLowerCase() !== wallet.toLowerCase()) {
      return badRequest("payment tx sender must match walletAddress");
    }

    const { code, model } = await generateHookWithKimi(composed);
    const row = await insertGeneratedHook({
      walletAddress: wallet,
      txHash,
      chainId,
      prompt: composed,
      solidityCode: code,
      model,
      forkedFrom,
    });
    return NextResponse.json({
      ok: true,
      hook: {
        id: row.id,
        wallet: row.wallet_address,
        model: row.model,
        txHash: row.tx_hash,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "launch failed";
    return serverError(message);
  }
}
