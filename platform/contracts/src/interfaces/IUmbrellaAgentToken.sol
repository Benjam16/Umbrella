// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MissionProofLib } from "../libraries/MissionProofLib.sol";

/**
 * @title IUmbrellaAgentToken
 * @notice Surface the Uniswap v4 hook + off-chain relayer rely on.
 *
 * Intentionally does NOT include ERC-20 methods — they come from inheritance.
 * Consumers use `import { IERC20 } from "..."` alongside this interface.
 */
interface IUmbrellaAgentToken {
    event MissionSuccess(
        bytes32 indexed digest,
        bytes32 indexed runIdHash,
        uint32 successScore,
        uint64 revenueCents,
        uint16 nodesExecuted
    );

    event TreasuryFunded(address indexed from, uint256 amount);
    event TreasurySpent(address indexed to, uint256 amount, string reason);
    event AttesterRotated(address indexed oldAttester, address indexed newAttester);
    event HookSet(address indexed hook);

    /// @notice Anchor a signed ProofOfSuccess to this token's stats.
    function recordSuccess(MissionProofLib.MissionProof calldata proof, bytes calldata signature) external;

    /// @notice Current rolling success rate, 0..10_000 (basis points).
    function successRate() external view returns (uint32);

    /// @notice Total missions whose proofs were anchored here.
    function totalMissions() external view returns (uint256);

    /// @notice Total successful missions (status == 1).
    function successfulMissions() external view returns (uint256);

    /// @notice Sum of all reported revenues, in USD cents.
    function totalRevenueCents() external view returns (uint256);

    /// @notice Timestamp of the last anchored mission.
    function lastMissionAt() external view returns (uint64);

    /// @notice Attester address whose signatures this token accepts.
    function attester() external view returns (address);

    /// @notice Identifier of the blueprint this token is backed by.
    function blueprintId() external view returns (string memory);
}
