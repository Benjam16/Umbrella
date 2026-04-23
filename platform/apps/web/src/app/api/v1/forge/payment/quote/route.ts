import { NextResponse } from "next/server";
import { parseEther } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const treasury = process.env.TREASURY_ADDRESS?.trim() ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(treasury)) {
    return NextResponse.json(
      { error: "TREASURY_ADDRESS is not configured" },
      { status: 503 },
    );
  }

  const minWei = BigInt(
    process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI?.trim() ?? parseEther("0.0011").toString(),
  );

  return NextResponse.json({
    treasuryAddress: treasury.toLowerCase(),
    minPaymentWei: minWei.toString(),
    minPaymentHex: `0x${minWei.toString(16)}`,
  });
}

