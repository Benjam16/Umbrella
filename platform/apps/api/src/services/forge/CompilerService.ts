import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Hex } from "viem";

import { assertContractsRoot } from "./contractsRoot.js";

const execFileAsync = promisify(execFile);

export type CompiledArtifact = {
  contractName: string;
  fileBase: string;
  abi: unknown[];
  bytecode: Hex;
  /** Relative to forge `out/` — for debugging */
  artifactRelPath: string;
};

const MAX_SOURCE_BYTES = 512_000;
const FORGE_TIMEOUT_MS = 180_000;

function forgeBinary(): string {
  return process.env.FORGE_PATH?.trim() || "forge";
}

/** First top-level `contract Name` in source (best-effort). */
export function inferContractName(source: string): string | null {
  const m = source.match(/contract\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  return m?.[1] ?? null;
}

function safeFileBase(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("contractName must be alphanumeric/underscore");
  }
  return name;
}

type EvmBytecode = { object?: string };
type ForgeArtifactLike = {
  abi?: unknown[];
  bytecode?: EvmBytecode;
  evm?: { bytecode?: EvmBytecode };
};

function bytecodeHexFromForgeContract(raw: ForgeArtifactLike): Hex {
  const obj = raw.bytecode?.object ?? raw.evm?.bytecode?.object;
  if (!obj || typeof obj !== "string" || !obj.startsWith("0x")) {
    throw new Error("artifact missing bytecode (expected bytecode.object or evm.bytecode.object)");
  }
  return obj as Hex;
}

type ForgeBuildJson = {
  errors?: Array<{
    severity?: string;
    type?: string;
    message?: string;
    formattedMessage?: string;
  }>;
  /** Foundry ≥ recent: path → contract name → array of build entries */
  contracts?: Record<string, Record<string, unknown>>;
};

function fatalForgeMessages(errors: ForgeBuildJson["errors"]): string[] {
  if (!errors?.length) return [];
  return errors
    .filter((e) => {
      const sev = (e.severity ?? "").toLowerCase();
      const typ = (e.type ?? "").toLowerCase();
      return sev !== "warning" && typ !== "warning";
    })
    .map((e) => e.formattedMessage || e.message || "unknown compiler error");
}

/**
 * Walk `forge build --json` `contracts` map and pull ABI + bytecode for our file/name.
 */
function extractFromForgeBuildJson(
  data: ForgeBuildJson,
  fileBase: string,
  contractName: string,
): { abi: unknown[]; bytecode: Hex } | null {
  const contracts = data.contracts;
  if (!contracts) return null;
  const suffix = `${fileBase}.sol`;
  for (const [absPath, byName] of Object.entries(contracts)) {
    if (!absPath.replace(/\\/g, "/").endsWith(suffix)) continue;
    const entry = byName[contractName];
    if (entry == null) continue;
    const arr = Array.isArray(entry) ? entry : [entry];
    for (const cell of arr) {
      const wrapped = cell as { contract?: ForgeArtifactLike };
      const raw = wrapped?.contract;
      if (!raw) continue;
      try {
        const abi = Array.isArray(raw.abi) ? raw.abi : [];
        const bytecode = bytecodeHexFromForgeContract(raw);
        return { abi, bytecode };
      } catch {
        /* try next cell */
      }
    }
  }
  return null;
}

/** Flat `out/Contract.sol/Name.json` shape (fallback). */
type ForgeOutArtifactJson = ForgeArtifactLike & { abi?: unknown[] };

function extractFromOutArtifactJson(raw: ForgeOutArtifactJson): { abi: unknown[]; bytecode: Hex } {
  const abi = Array.isArray(raw.abi) ? raw.abi : [];
  const bytecode = bytecodeHexFromForgeContract(raw);
  return { abi, bytecode };
}

/**
 * Compile Solidity in an isolated temp project: `mkdtemp` → copy `foundry.toml` + `remappings.txt`
 * → symlink monorepo `lib/` → write `src/<Name>.sol` → **`forge build --out out --json`**
 * → parse JSON for ABI + bytecode → delete temp dir.
 *
 * Requires **Foundry** on `PATH` (or set `FORGE_PATH`). On a Gemma VPS: install via
 * Foundry’s installer so `forge` is available globally.
 */
export async function compileSolidityInTempProject(opts: {
  source: string;
  contractName: string;
}): Promise<CompiledArtifact> {
  const source = opts.source.trim();
  if (source.length > MAX_SOURCE_BYTES) {
    throw new Error(`source exceeds ${MAX_SOURCE_BYTES} bytes`);
  }

  const contractsRoot = assertContractsRoot();
  const contractName = safeFileBase(opts.contractName);
  const fileBase = contractName;

  const tmpRoot = await mkdtemp(path.join(tmpdir(), "umbrella-forge-"));
  const srcDir = path.join(tmpRoot, "src");
  const solPath = path.join(srcDir, `${fileBase}.sol`);
  const artifactPath = path.join(tmpRoot, "out", `${fileBase}.sol`, `${contractName}.json`);

  try {
    await mkdir(srcDir, { recursive: true });
    await copyFile(path.join(contractsRoot, "foundry.toml"), path.join(tmpRoot, "foundry.toml"));
    await copyFile(path.join(contractsRoot, "remappings.txt"), path.join(tmpRoot, "remappings.txt"));
    try {
      await symlink(path.join(contractsRoot, "lib"), path.join(tmpRoot, "lib"));
    } catch (e) {
      throw new Error(
        `Could not symlink lib/ into temp forge project (${String(e)}). Set UMBRELLA_CONTRACTS_ROOT or fix permissions.`,
      );
    }

    await writeFile(solPath, source, "utf8");

    const forge = forgeBinary();
    let stdout = "";
    let stderr = "";
    try {
      const result = await execFileAsync(
        forge,
        ["build", "--root", tmpRoot, "--out", "out", "--force", "--json"],
        {
          timeout: FORGE_TIMEOUT_MS,
          env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" },
          maxBuffer: 40 * 1024 * 1024,
        },
      );
      stdout = result.stdout?.toString() ?? "";
      stderr = result.stderr?.toString() ?? "";
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
      stdout = e.stdout?.toString() ?? "";
      stderr = e.stderr?.toString() ?? "";
      throw new Error(
        `forge build failed: ${e.message ?? String(err)}\n${stderr.slice(0, 8000)}${stdout.slice(0, 4000)}`,
      );
    }

    let buildJson: ForgeBuildJson;
    try {
      buildJson = JSON.parse(stdout) as ForgeBuildJson;
    } catch {
      throw new Error(
        `forge did not return valid JSON on stdout. stderr (tail): ${stderr.slice(-2000)}`,
      );
    }

    const fatals = fatalForgeMessages(buildJson.errors);
    if (fatals.length) {
      throw new Error(`Solidity compiler error(s):\n${fatals.join("\n")}`);
    }

    let abi: unknown[];
    let bytecode: Hex;

    const fromStdout = extractFromForgeBuildJson(buildJson, fileBase, contractName);
    if (fromStdout) {
      abi = fromStdout.abi;
      bytecode = fromStdout.bytecode;
    } else {
      const rawJson = JSON.parse(await readFile(artifactPath, "utf8")) as ForgeOutArtifactJson;
      const parsed = extractFromOutArtifactJson(rawJson);
      abi = parsed.abi;
      bytecode = parsed.bytecode;
    }

    return {
      contractName,
      fileBase,
      abi,
      bytecode,
      artifactRelPath: path.relative(tmpRoot, artifactPath),
    };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
