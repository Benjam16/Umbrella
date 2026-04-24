import { NextResponse } from "next/server";
import { parseEther } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const chainIdRaw = process.env.UMBRELLA_FORGE_CHAIN_ID?.trim() ?? "84532";
  const chainId = Number(chainIdRaw);
  const isSepolia = chainId === 84532;
  if (chainId !== 8453 && chainId !== 84532) {
    return NextResponse.json({ error: "invalid UMBRELLA_FORGE_CHAIN_ID" }, { status: 500 });
  }

  const treasury =
    (isSepolia ? process.env.TREASURY_ADDRESS_SEPOLIA : undefined) ??
    process.env.TREASURY_ADDRESS ??
    "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(treasury)) {
    return NextResponse.json(
      { error: "TREASURY_ADDRESS is not configured" },
      { status: 503 },
    );
  }

  const minWei = BigInt(
    (
      (isSepolia ? process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI_SEPOLIA : undefined) ??
      process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI ??
      parseEther("0.0011").toString()
    ).trim(),
  );

  return NextResponse.json({
    chainId,
    treasuryAddress: treasury.toLowerCase(),
    minPaymentWei: minWei.toString(),
    minPaymentHex: `0x${minWei.toString(16)}`,
  });
}

