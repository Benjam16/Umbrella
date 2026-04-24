import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";

import { agentTokenFactoryAbi } from "@/lib/launch/abi";
import { getLaunchConfig, LaunchConfigError } from "@/lib/launch/chain-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/forge/launch/prepare?chainId=...&wallet=...&name=...&symbol=...&blueprint=...&supply=...
 *
 * Returns everything the client needs to prompt the user for the factory tx:
 *   • configured factory address + treasury
 *   • on-chain `launchFeeWei` + `defaultAttester`
 *   • predicted CREATE2 address the token will deploy to
 *
 * The client shows the predicted address in the confirmation UI so the user
 * knows what they're about to bring to life before they sign.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const chainIdParam = url.searchParams.get("chainId");
  const wallet = url.searchParams.get("wallet") ?? "";
  const name = url.searchParams.get("name") ?? "";
  const symbol = url.searchParams.get("symbol") ?? "";
  const blueprint = url.searchParams.get("blueprint") ?? "";
  const supply = url.searchParams.get("supply") ?? "1000000000000000000000000";

  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "wallet must be a 0x address" }, { status: 400 });
  }
  if (name.length < 2 || symbol.length < 2 || blueprint.length < 2) {
    return NextResponse.json({ error: "name/symbol/blueprint required" }, { status: 400 });
  }

  try {
    const config = getLaunchConfig(chainIdParam ? Number(chainIdParam) : undefined);
    const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
    const [launchFeeWei, defaultAttester] = await Promise.all([
      publicClient.readContract({
        address: config.agentTokenFactory,
        abi: agentTokenFactoryAbi,
        functionName: "launchFeeWei",
      }),
      publicClient.readContract({
        address: config.agentTokenFactory,
        abi: agentTokenFactoryAbi,
        functionName: "defaultAttester",
      }),
    ]);

    let predictedTokenAddress: Address | null = null;
    try {
      predictedTokenAddress = (await publicClient.readContract({
        address: config.agentTokenFactory,
        abi: agentTokenFactoryAbi,
        functionName: "predictTokenAddress",
        args: [name, symbol.toUpperCase(), blueprint, defaultAttester, wallet as Address, BigInt(supply)],
      })) as Address;
    } catch {
      predictedTokenAddress = null;
    }

    return NextResponse.json({
      chainId: config.chainId,
      factoryAddress: config.agentTokenFactory,
      curveFactoryAddress: config.curveFactory,
      treasuryAddress: config.treasury,
      defaultAttester,
      launchFeeWei: launchFeeWei.toString(),
      launchFeeHex: `0x${(launchFeeWei as bigint).toString(16)}`,
      graduationThresholdWei: config.graduationThresholdWei.toString(),
      predictedTokenAddress,
      initialSupply: supply,
      explorer: {
        addressUrlTemplate: config.explorerAddressUrl("{address}"),
        txUrlTemplate: config.explorerTxUrl("{tx}"),
      },
    });
  } catch (err) {
    const message = err instanceof LaunchConfigError ? err.message : err instanceof Error ? err.message : "prepare failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
