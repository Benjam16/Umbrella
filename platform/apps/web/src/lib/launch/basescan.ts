import { readFileSync } from "fs";
import { join } from "path";

/**
 * Minimal Basescan (Etherscan v2) verify client.
 *
 * Etherscan's v2 endpoint uses a single base URL with a `chainid` query
 * parameter. Submissions return a `guid` that has to be polled with
 * `action=checkverifystatus` until the response flips from "Pending in queue"
 * to "Pass - Verified".
 *
 * We keep this client dependency-free — it's just fetch + URLSearchParams —
 * so it works from both Next.js route handlers and background tasks.
 */

export type VerifySubmission = {
  chainId: number;
  contractAddress: string;
  contractName: string;
  sourceCode: string;
  constructorArgsHex: string;
  compilerVersion?: string;
  optimizerEnabled?: boolean;
  optimizerRuns?: number;
  evmVersion?: string;
  licenseType?: number;
};

export type VerifyStatus =
  | { state: "skipped"; reason: string }
  | { state: "submitted"; guid: string }
  | { state: "pending"; guid: string; message: string }
  | { state: "verified"; guid: string; message: string }
  | { state: "failed"; guid?: string; message: string };

function baseUrlForChain(chainId: number): string {
  // Etherscan v2 multichain endpoint handles both networks.
  if (chainId === 8453 || chainId === 84532) {
    return "https://api.etherscan.io/v2/api";
  }
  throw new Error(`basescan verify: unsupported chain ${chainId}`);
}

function apiKey(): string | null {
  return (process.env.BASESCAN_API_KEY?.trim() || process.env.ETHERSCAN_API_KEY?.trim()) ?? null;
}

function readLocalSource(relPath: string): string {
  const candidates = [
    join(process.cwd(), "../../contracts", relPath),
    join(process.cwd(), "../../../contracts", relPath),
    join(process.cwd(), "platform/contracts", relPath),
  ];
  let lastError: unknown = null;
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf-8");
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `basescan: source not found for ${relPath}. ${lastError instanceof Error ? lastError.message : ""}`,
  );
}

/**
 * Single-file verify submission. We flatten-on-the-fly by pulling the
 * contract source directly off disk (everything in platform/contracts is
 * either built-in or vendored in remappings.txt, so solc sees a matching tree).
 */
export async function submitVerifyMissionRecord(args: {
  chainId: number;
  address: string;
  constructorArgsHex: string;
}): Promise<VerifyStatus> {
  const key = apiKey();
  if (!key) return { state: "skipped", reason: "BASESCAN_API_KEY not set" };

  const sourceCode = readLocalSource("src/UmbrellaAgentMissionRecord.sol");
  const body = new URLSearchParams();
  body.set("apikey", key);
  body.set("chainid", String(args.chainId));
  body.set("module", "contract");
  body.set("action", "verifysourcecode");
  body.set("contractaddress", args.address);
  body.set("sourceCode", sourceCode);
  body.set("codeformat", "solidity-single-file");
  body.set("contractname", "UmbrellaAgentMissionRecord");
  body.set("compilerversion", "v0.8.26+commit.8a97fa7a");
  body.set("optimizationUsed", "1");
  body.set("runs", "20000");
  body.set("evmversion", "default");
  body.set("constructorArguements", args.constructorArgsHex); // Etherscan typo preserved
  body.set("licenseType", "3"); // MIT

  let res: Response;
  try {
    res = await fetch(baseUrlForChain(args.chainId), { method: "POST", body });
  } catch (err) {
    return {
      state: "failed",
      message: `verify submit network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const text = await res.text();
  let json: { status?: string; message?: string; result?: string };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    return { state: "failed", message: `verify submit bad response: ${text.slice(0, 160)}` };
  }
  if (json.status !== "1" || !json.result) {
    // Etherscan returns status "0" with the message in `result` for duplicates.
    if (/already verified/i.test(json.result ?? "") || /already verified/i.test(json.message ?? "")) {
      return { state: "verified", guid: "preverified", message: json.result ?? "" };
    }
    return { state: "failed", message: json.result ?? json.message ?? "verify submit failed" };
  }
  return { state: "submitted", guid: json.result };
}

export async function pollVerifyStatus(args: {
  chainId: number;
  guid: string;
}): Promise<VerifyStatus> {
  const key = apiKey();
  if (!key) return { state: "skipped", reason: "BASESCAN_API_KEY not set" };

  const url = new URL(baseUrlForChain(args.chainId));
  url.searchParams.set("apikey", key);
  url.searchParams.set("chainid", String(args.chainId));
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "checkverifystatus");
  url.searchParams.set("guid", args.guid);

  const res = await fetch(url.toString());
  const text = await res.text();
  let json: { status?: string; result?: string };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    return { state: "pending", guid: args.guid, message: text.slice(0, 160) };
  }
  const result = json.result ?? "";
  if (json.status === "1" && /pass/i.test(result)) {
    return { state: "verified", guid: args.guid, message: result };
  }
  if (/pending/i.test(result) || /queue/i.test(result)) {
    return { state: "pending", guid: args.guid, message: result };
  }
  return { state: "failed", guid: args.guid, message: result || "unknown status" };
}
