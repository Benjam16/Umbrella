import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Minimal Basescan (Etherscan v2) verify client.
 *
 * Etherscan's v2 endpoint uses a single base URL with a `chainid` query
 * parameter. Submissions return a `guid` that has to be polled with
 * `action=checkverifystatus` until the response flips from "Pending in queue"
 * to "Pass - Verified".
 *
 * Verification uses `solidity-standard-json-input` so compiler metadata
 * (notably `metadata.bytecodeHash = ipfs` from Foundry) matches what was
 * deployed. Single-file verify recompiles with different metadata and fails
 * with "runtime bytecode does NOT match" even when source is correct.
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

const VERIFY_COMPILER = "v0.8.26+commit.8a97fa7a";
const VERIFY_RUNS = 20_000;

function verifyEvmVersion(): string {
  return (process.env.UMBRELLA_VERIFY_EVM_VERSION?.trim() || "cancun").toLowerCase();
}

/** Forge `foundry.toml` + solc metadata for UmbrellaAgentMissionRecord (no imports). */
function buildMissionRecordStandardJsonInput(): Record<string, unknown> {
  const content = readLocalSource("src/UmbrellaAgentMissionRecord.sol");
  return {
    language: "Solidity",
    sources: {
      "src/UmbrellaAgentMissionRecord.sol": { content },
    },
    settings: {
      remappings: [],
      optimizer: { enabled: true, runs: VERIFY_RUNS },
      metadata: { useLiteralContent: false, bytecodeHash: "ipfs", appendCBOR: true },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"],
        },
      },
      evmVersion: verifyEvmVersion(),
      viaIR: false,
      libraries: {},
      compilationTarget: {
        "src/UmbrellaAgentMissionRecord.sol": "UmbrellaAgentMissionRecord",
      },
    },
  };
}

function contractOutRoots(): string[] {
  return [
    process.env.UMBRELLA_CONTRACTS_OUT_DIR?.trim(),
    join(process.cwd(), "../../contracts/out"),
    join(process.cwd(), "../../../contracts/out"),
    join(process.cwd(), "platform/contracts/out"),
  ].filter((v): v is string => !!v);
}

function tryLoadBondingCurveVerifyFromBuildInfo(): Record<string, unknown> | null {
  for (const root of contractOutRoots()) {
    const dir = join(root, "build-info");
    let names: string[];
    try {
      names = readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const name of names) {
      try {
        const j = JSON.parse(readFileSync(join(dir, name), "utf-8")) as {
          input?: { language?: string; sources?: Record<string, { content?: string }>; settings?: Record<string, unknown> };
          output?: { contracts?: Record<string, { UmbrellaBondingCurve?: unknown }> };
        };
        if (!j.input?.sources || !j.output?.contracts?.["src/UmbrellaBondingCurve.sol"]?.UmbrellaBondingCurve) {
          continue;
        }
        return {
          language: j.input.language ?? "Solidity",
          sources: j.input.sources,
          settings: {
            ...j.input.settings,
            compilationTarget: { "src/UmbrellaBondingCurve.sol": "UmbrellaBondingCurve" },
            outputSelection: {
              "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] },
            },
          },
        };
      } catch {
        // skip malformed
      }
    }
  }
  return null;
}

/** Checked-in snapshot from `forge build` (regenerate after curve source changes). */
function tryLoadEmbeddedBondingCurveVerifyJson(): Record<string, unknown> | null {
  const candidates = [
    join(process.cwd(), "src/lib/launch/embedded/UmbrellaBondingCurve-verify-standard-input.json"),
    join(process.cwd(), "platform/apps/web/src/lib/launch/embedded/UmbrellaBondingCurve-verify-standard-input.json"),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    } catch {
      // try next
    }
  }
  return null;
}

function normalizeBondingCurveVerifyInput(raw: Record<string, unknown>): Record<string, unknown> {
  const asBuildInfo = raw as {
    input?: { language?: string; sources?: Record<string, { content?: string }>; settings?: Record<string, unknown> };
    output?: { contracts?: Record<string, { UmbrellaBondingCurve?: unknown }> };
  };
  if (asBuildInfo.input?.sources && asBuildInfo.output?.contracts?.["src/UmbrellaBondingCurve.sol"]?.UmbrellaBondingCurve) {
    return {
      language: asBuildInfo.input.language ?? "Solidity",
      sources: asBuildInfo.input.sources,
      settings: {
        ...asBuildInfo.input.settings,
        compilationTarget: { "src/UmbrellaBondingCurve.sol": "UmbrellaBondingCurve" },
        outputSelection: {
          "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] },
        },
      },
    };
  }
  return raw;
}

function loadBondingCurveStandardJsonInput(): Record<string, unknown> {
  const envPath = process.env.UMBRELLA_BONDING_CURVE_VERIFY_STANDARD_JSON?.trim();
  if (envPath) {
    try {
      return normalizeBondingCurveVerifyInput(
        JSON.parse(readFileSync(envPath, "utf-8")) as Record<string, unknown>,
      );
    } catch (err) {
      throw new Error(
        `UMBRELLA_BONDING_CURVE_VERIFY_STANDARD_JSON unreadable: ${envPath}. ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  const fromBuild = tryLoadBondingCurveVerifyFromBuildInfo();
  if (fromBuild) return fromBuild;
  const embedded = tryLoadEmbeddedBondingCurveVerifyJson();
  if (embedded) return embedded;
  throw new Error(
    "Bonding curve verify input missing: run `forge build` in platform/contracts (so out/build-info contains UmbrellaBondingCurve) or ship embedded UmbrellaBondingCurve-verify-standard-input.json",
  );
}

async function postVerifyStandardJson(args: {
  chainId: number;
  address: string;
  /** e.g. `src/UmbrellaBondingCurve.sol:UmbrellaBondingCurve` */
  contractPathAndName: string;
  standardJsonInput: Record<string, unknown>;
  constructorArgsHex: string;
}): Promise<VerifyStatus> {
  const key = apiKey();
  if (!key) return { state: "skipped", reason: "BASESCAN_API_KEY not set" };

  const body = new URLSearchParams();
  body.set("apikey", key);
  body.set("chainid", String(args.chainId));
  body.set("module", "contract");
  body.set("action", "verifysourcecode");
  body.set("contractaddress", args.address);
  body.set("sourceCode", JSON.stringify(args.standardJsonInput));
  body.set("codeformat", "solidity-standard-json-input");
  body.set("contractname", args.contractPathAndName);
  body.set("compilerversion", VERIFY_COMPILER);
  body.set("constructorArguements", args.constructorArgsHex);
  body.set("licenseType", "3");

  const submitUrl = new URL(baseUrlForChain(args.chainId));
  submitUrl.searchParams.set("chainid", String(args.chainId));

  let res: Response;
  try {
    res = await fetch(submitUrl.toString(), { method: "POST", body });
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
    if (/already verified/i.test(json.result ?? "") || /already verified/i.test(json.message ?? "")) {
      return { state: "verified", guid: "preverified", message: json.result ?? "" };
    }
    return { state: "failed", message: json.result ?? json.message ?? "verify submit failed" };
  }
  return { state: "submitted", guid: json.result };
}

export async function submitVerifyMissionRecord(args: {
  chainId: number;
  address: string;
  constructorArgsHex: string;
}): Promise<VerifyStatus> {
  return postVerifyStandardJson({
    chainId: args.chainId,
    address: args.address,
    contractPathAndName: "src/UmbrellaAgentMissionRecord.sol:UmbrellaAgentMissionRecord",
    standardJsonInput: buildMissionRecordStandardJsonInput(),
    constructorArgsHex: args.constructorArgsHex,
  });
}

export async function submitVerifyBondingCurve(args: {
  chainId: number;
  address: string;
  constructorArgsHex: string;
}): Promise<VerifyStatus> {
  return postVerifyStandardJson({
    chainId: args.chainId,
    address: args.address,
    contractPathAndName: "src/UmbrellaBondingCurve.sol:UmbrellaBondingCurve",
    standardJsonInput: loadBondingCurveStandardJsonInput(),
    constructorArgsHex: args.constructorArgsHex,
  });
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
