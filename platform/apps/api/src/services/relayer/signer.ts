import { hashTypedData, keccak256, type Hex, type TypedDataDomain } from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";
import type { ProofOfSuccess } from "@umbrella/runner/types";

/**
 * EIP-712 types matching MissionProofLib.sol — must stay byte-for-byte in sync
 * with the contract. Changing one without the other breaks signature checks.
 */
export const MISSION_PROOF_TYPES = {
  MissionProof: [
    { name: "version", type: "uint8" },
    { name: "runIdHash", type: "bytes32" },
    { name: "blueprintIdHash", type: "bytes32" },
    { name: "ownerHash", type: "bytes32" },
    { name: "successScore", type: "uint32" },
    { name: "revenueCents", type: "uint64" },
    { name: "nodesExecuted", type: "uint16" },
    { name: "durationSeconds", type: "uint32" },
    { name: "status", type: "uint8" },
    { name: "mintedAt", type: "uint64" },
  ],
} as const;

/**
 * Calldata shape for `UmbrellaAgentToken.recordSuccess`. viem will ABI-encode
 * this into the tuple parameter described in abi.ts.
 */
export type MissionProofStruct = {
  version: number;
  runIdHash: Hex;
  blueprintIdHash: Hex;
  ownerHash: Hex;
  successScore: number;
  revenueCents: bigint;
  nodesExecuted: number;
  durationSeconds: number;
  status: number;
  mintedAt: bigint;
};

let cachedAccount: PrivateKeyAccount | null = null;
let cachedHookRegistrar: PrivateKeyAccount | null = null;

/**
 * Loads the relayer's signing identity.
 *
 * Priority:
 *   1. `UMBRELLA_RELAYER_PRIVATE_KEY` — a production 0x-prefixed hex key.
 *   2. An ephemeral key generated on boot — logged to stderr so dev can
 *      still inspect `attester` addresses. Any restart rolls the key.
 *
 * In production, load this from KMS or a TEE — never ship a plaintext env.
 */
export function getRelayerAccount(): PrivateKeyAccount {
  if (cachedAccount) return cachedAccount;

  const envKey = process.env.UMBRELLA_RELAYER_PRIVATE_KEY as Hex | undefined;
  if (envKey && /^0x[0-9a-fA-F]{64}$/.test(envKey)) {
    cachedAccount = privateKeyToAccount(envKey);
    return cachedAccount;
  }

  const ephemeral = generatePrivateKey();
  cachedAccount = privateKeyToAccount(ephemeral);
  console.warn(
    `[relayer] UMBRELLA_RELAYER_PRIVATE_KEY not set — generated ephemeral key. ` +
      `Attester=${cachedAccount.address}. Set the env var before deploying.`,
  );
  return cachedAccount;
}

/**
 * Loads the hook registrar's signing identity (used for hook-admin actions like
 * `UmbrellaPlatformFeeHook.registerPool`).
 *
 * Priority:
 *   1. `UMBRELLA_HOOK_REGISTRAR_PRIVATE_KEY` — dedicated registrar key.
 *   2. `UMBRELLA_RELAYER_PRIVATE_KEY` — fall back to relayer for single-key setups.
 */
export function getHookRegistrarAccount(): PrivateKeyAccount {
  if (cachedHookRegistrar) return cachedHookRegistrar;

  const registrarKey = process.env.UMBRELLA_HOOK_REGISTRAR_PRIVATE_KEY as Hex | undefined;
  if (registrarKey && /^0x[0-9a-fA-F]{64}$/.test(registrarKey)) {
    cachedHookRegistrar = privateKeyToAccount(registrarKey);
    return cachedHookRegistrar;
  }

  cachedHookRegistrar = getRelayerAccount();
  return cachedHookRegistrar;
}

/**
 * Convert a ProofOfSuccess (the off-chain JSON view) into the on-chain
 * MissionProof struct. Strings (runId, blueprintId, ownerFingerprint) are
 * keccak-hashed so the contract never needs dynamic string storage.
 */
export function toMissionProofStruct(proof: ProofOfSuccess): MissionProofStruct {
  return {
    version: proof.version,
    runIdHash: keccak256(toUtf8Bytes(proof.runId)),
    blueprintIdHash: keccak256(toUtf8Bytes(proof.blueprintId)),
    ownerHash: keccak256(toUtf8Bytes(proof.ownerFingerprint ?? "")),
    successScore: proof.successScore,
    revenueCents: BigInt(proof.revenueCents),
    nodesExecuted: proof.nodesExecuted,
    durationSeconds: Math.max(0, Math.floor(proof.durationMs / 1000)),
    status: proof.status === "succeeded" ? 1 : 2,
    mintedAt: BigInt(proof.mintedAt),
  };
}

/**
 * Build the EIP-712 domain separator for a specific deployment. The token
 * contract constructs the identical domain via `EIP712("UmbrellaAgentToken", "1")`.
 */
export function domainFor(tokenAddress: `0x${string}`, chainId: number): TypedDataDomain {
  return {
    name: "UmbrellaAgentToken",
    version: "1",
    chainId,
    verifyingContract: tokenAddress,
  };
}

/**
 * Sign the MissionProof as EIP-712 typed data so the AgentToken contract
 * can verify via `_hashTypedDataV4 + ECDSA.recover`. Returns both the signature
 * and the precomputed digest (useful for logging + simulated anchors).
 */
export async function signProof(
  proof: ProofOfSuccess,
  tokenAddress: `0x${string}`,
  chainId: number,
): Promise<{
  digest: Hex;
  signature: Hex;
  attester: Hex;
  struct: MissionProofStruct;
}> {
  const account = getRelayerAccount();
  const struct = toMissionProofStruct(proof);
  const domain = domainFor(tokenAddress, chainId);

  const signature = await account.signTypedData({
    domain,
    types: MISSION_PROOF_TYPES,
    primaryType: "MissionProof",
    message: struct,
  });
  const digest = hashTypedData({
    domain,
    types: MISSION_PROOF_TYPES,
    primaryType: "MissionProof",
    message: struct,
  });

  return { digest, signature, attester: account.address, struct };
}

function toUtf8Bytes(s: string): Hex {
  const bytes = new TextEncoder().encode(s);
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as Hex;
}
