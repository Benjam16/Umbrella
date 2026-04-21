#!/usr/bin/env tsx
/**
 * sync-registry.ts
 *
 * Reads the broadcast artifact produced by `forge script DeployUmbrella.s.sol`
 * and writes real contract addresses into:
 *   - platform/apps/api/config/agent-registry.json
 *   - platform/apps/api/.env.example (Factory + Registry envs, commented)
 *
 * Usage:
 *   pnpm -F @umbrella/contracts sync -- --chain base_sepolia
 *   pnpm -F @umbrella/contracts sync -- --chain base
 *
 * If --chain is omitted, the script walks all chains under broadcast/ and
 * picks the most recently modified run.
 */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

type Arg = { chain?: string; dry?: boolean };

function parseArgs(): Arg {
  const args: Arg = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--chain" && process.argv[i + 1]) args.chain = process.argv[++i];
    else if (a === "--dry" || a === "--dry-run") args.dry = true;
  }
  return args;
}

const CHAIN_ID_BY_NAME: Record<string, number> = {
  base: 8453,
  base_sepolia: 84532,
};

const CHAIN_NAME_BY_ID: Record<number, string> = Object.fromEntries(
  Object.entries(CHAIN_ID_BY_NAME).map(([k, v]) => [v, k]),
);

type BroadcastTx = {
  transactionType: string;
  contractName: string;
  contractAddress?: `0x${string}`;
  arguments?: string[];
  additionalContracts?: Array<{
    transactionType: string;
    address: `0x${string}`;
    initCode: string;
  }>;
};

type Broadcast = {
  transactions: BroadcastTx[];
  chain: number;
  timestamp: number;
};

async function findLatestBroadcast(contractsRoot: string, chainHint?: string) {
  const broadcastRoot = resolve(contractsRoot, "broadcast", "DeployUmbrella.s.sol");
  if (!existsSync(broadcastRoot)) {
    throw new Error(
      `No broadcast folder at ${broadcastRoot}. Did you run \`pnpm deploy:sepolia\` yet?`,
    );
  }

  if (chainHint) {
    const chainId = CHAIN_ID_BY_NAME[chainHint] ?? Number(chainHint);
    const dir = resolve(broadcastRoot, String(chainId));
    if (!existsSync(dir)) {
      throw new Error(`No broadcast for chain ${chainHint} (${chainId}) at ${dir}`);
    }
    return resolve(dir, "run-latest.json");
  }

  const chains = await readdir(broadcastRoot);
  let newest: { path: string; mtime: number } | null = null;
  for (const chain of chains) {
    const p = resolve(broadcastRoot, chain, "run-latest.json");
    if (!existsSync(p)) continue;
    const m = (await stat(p)).mtimeMs;
    if (!newest || m > newest.mtime) newest = { path: p, mtime: m };
  }
  if (!newest) throw new Error(`No run-latest.json found under ${broadcastRoot}`);
  return newest.path;
}

async function main() {
  const { chain, dry } = parseArgs();
  const thisFile = fileURLToPath(import.meta.url);
  const contractsRoot = resolve(dirname(thisFile), "..");
  const monorepoRoot = resolve(contractsRoot, "..", "..");
  const runPath = await findLatestBroadcast(contractsRoot, chain);
  console.log(`Reading broadcast artifact: ${runPath}`);

  const broadcast: Broadcast = JSON.parse(await readFile(runPath, "utf-8"));
  const chainId = broadcast.chain;
  const chainName = CHAIN_NAME_BY_ID[chainId] ?? `chain-${chainId}`;
  console.log(`Chain: ${chainName} (${chainId})`);

  // 1. Pull the Registry + Factory deployments.
  const registry = broadcast.transactions.find(
    (t) => t.transactionType === "CREATE" && t.contractName === "UmbrellaAgentRegistry",
  )?.contractAddress;
  const factory = broadcast.transactions.find(
    (t) => t.transactionType === "CREATE" && t.contractName === "UmbrellaAgentTokenFactory",
  )?.contractAddress;
  if (!registry || !factory) {
    throw new Error(
      "Broadcast missing UmbrellaAgentRegistry or UmbrellaAgentTokenFactory creation tx.",
    );
  }
  console.log(`Registry: ${registry}`);
  console.log(`Factory : ${factory}`);

  // 2. Each factory.createAgentToken call produces an `additionalContracts` entry
  //    (the inner CREATE2) that we map by argument order.
  const createCalls = broadcast.transactions.filter(
    (t) =>
      t.transactionType === "CALL" &&
      t.contractName === "UmbrellaAgentTokenFactory" &&
      t.arguments?.length === 4,
  );

  const tokens = createCalls.map((tx) => {
    const blueprintId = tx.arguments?.[2] ?? "";
    const symbol = tx.arguments?.[1] ?? "";
    const inner = tx.additionalContracts?.find((a) => a.transactionType === "CREATE2");
    if (!inner) {
      throw new Error(`No CREATE2 child for blueprint ${blueprintId}`);
    }
    return { blueprintId, symbol, tokenAddress: inner.address };
  });

  for (const t of tokens) console.log(`  ${t.blueprintId} -> ${t.tokenAddress}`);

  // 3. Emit updated agent-registry.json alongside a sibling with platform meta.
  const registryPath = resolve(
    monorepoRoot,
    "platform/apps/api/config/agent-registry.json",
  );
  const deploymentsPath = resolve(
    monorepoRoot,
    "platform/apps/api/config/deployments.json",
  );

  const entries = tokens.map((t) => ({
    blueprintId: t.blueprintId,
    symbol: t.symbol,
    chainId,
    tokenAddress: t.tokenAddress,
  }));

  const deployments = {
    updatedAt: new Date().toISOString(),
    chains: {
      [chainId]: {
        chainName,
        registry,
        factory,
        tokens: entries,
      },
    },
  };

  if (dry) {
    console.log("\n--dry: would write:");
    console.log(registryPath);
    console.log(JSON.stringify(entries, null, 2));
    console.log(deploymentsPath);
    console.log(JSON.stringify(deployments, null, 2));
    return;
  }

  await writeFile(registryPath, JSON.stringify(entries, null, 2) + "\n");
  await writeFile(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log(`\nUpdated ${registryPath}`);
  console.log(`Updated ${deploymentsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
