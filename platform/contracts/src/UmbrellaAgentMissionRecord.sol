// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title  UmbrellaAgentMissionRecord
 * @notice Immutable on-chain record of the Kimi-generated mission logic for a
 *         specific agent token. Deployed per-launch so every agent on the
 *         marketplace has a verifiable "what it's programmed to do" address.
 *
 * This contract is intentionally minimal and pre-compiled. The server deploys
 * it with the Kimi output's keccak hash + a metadata URI pointing to the
 * full Solidity source in Supabase storage. We avoid running solc on arbitrary
 * Kimi output at launch time — Kimi's code is stored as data, not executed as
 * a hook. Once the agent graduates to a Uniswap v4 pool, the pool uses
 * `UmbrellaPerformanceHook`, which reads rolling stats from the token itself.
 */
contract UmbrellaAgentMissionRecord {
    /// @notice keccak256 of the Kimi-generated Solidity source.
    bytes32 public immutable missionCodeHash;
    /// @notice Creator wallet that launched the agent.
    address public immutable creator;
    /// @notice Associated UmbrellaAgentToken address.
    address public immutable token;
    /// @notice URI (typically ipfs:// or supabase bucket) of the full source.
    string public metadataURI;
    /// @notice Free-form mission description (short, on-chain for audit).
    string public missionLabel;
    /// @notice Timestamp of deployment.
    uint64 public immutable createdAt;

    event MissionRecorded(
        address indexed creator,
        address indexed token,
        bytes32 indexed missionCodeHash,
        string metadataURI,
        string missionLabel
    );

    constructor(
        address creator_,
        address token_,
        bytes32 missionCodeHash_,
        string memory metadataURI_,
        string memory missionLabel_
    ) {
        creator = creator_;
        token = token_;
        missionCodeHash = missionCodeHash_;
        metadataURI = metadataURI_;
        missionLabel = missionLabel_;
        createdAt = uint64(block.timestamp);
        emit MissionRecorded(creator_, token_, missionCodeHash_, metadataURI_, missionLabel_);
    }
}
