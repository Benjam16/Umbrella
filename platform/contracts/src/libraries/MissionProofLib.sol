// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title  MissionProofLib
 * @notice Canonical EIP-712 struct for the Umbrella Proof-of-Success attestation.
 *
 * The RelayerService in the API app builds and signs this exact struct
 * using viem's `signTypedData` before calling `UmbrellaAgentToken.recordSuccess`.
 * Keeping the typehash in a library means any future contract (a Cross-Chain
 * AgentToken on Optimism, a TEE-backed Attester, a Farcaster integration) can
 * reuse the format without drift.
 *
 * NOTE: Off-chain code hashes string identifiers (runId, blueprintId,
 * ownerFingerprint) with keccak256 before packing them into this struct,
 * because on-chain comparison of dynamic strings is gas-heavy and we never
 * need the raw strings post-verification.
 */
library MissionProofLib {
    /// @notice Canonical EIP-712 struct.
    struct MissionProof {
        uint8 version;            // schema version, currently 1
        bytes32 runIdHash;        // keccak256(bytes(runId))
        bytes32 blueprintIdHash;  // keccak256(bytes(blueprintId))
        bytes32 ownerHash;        // keccak256(bytes(ownerFingerprint ?? ""))
        uint32 successScore;      // 0..10_000 (basis points of success)
        uint64 revenueCents;      // USD value produced, integer cents
        uint16 nodesExecuted;     // number of DAG nodes run
        uint32 durationSeconds;   // startedAt → finishedAt
        uint8 status;             // 1 = succeeded, 2 = failed
        uint64 mintedAt;          // ms since epoch when proof was minted
    }

    /// @dev Must match the string used by viem off-chain, exactly.
    bytes32 internal constant TYPEHASH = keccak256(
        "MissionProof("
        "uint8 version,"
        "bytes32 runIdHash,"
        "bytes32 blueprintIdHash,"
        "bytes32 ownerHash,"
        "uint32 successScore,"
        "uint64 revenueCents,"
        "uint16 nodesExecuted,"
        "uint32 durationSeconds,"
        "uint8 status,"
        "uint64 mintedAt"
        ")"
    );

    /// @notice EIP-712 struct hash — the inner part of the typed data digest.
    function hash(MissionProof memory p) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPEHASH,
                p.version,
                p.runIdHash,
                p.blueprintIdHash,
                p.ownerHash,
                p.successScore,
                p.revenueCents,
                p.nodesExecuted,
                p.durationSeconds,
                p.status,
                p.mintedAt
            )
        );
    }
}
