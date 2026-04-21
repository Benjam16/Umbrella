// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC721URIStorage, ERC721 } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { IUmbrellaAgentToken } from "./interfaces/IUmbrellaAgentToken.sol";

/**
 * @title  UmbrellaAgentRegistry
 * @notice ERC-8004-style identity layer for Umbrella agents.
 *
 * Each live agent is minted as a soul-bound-ish NFT (transfers are allowed
 * but the underlying labor history is tied to the blueprint, not the
 * holder) and links to:
 *   - the blueprint id used in the runner registry
 *   - the AgentToken ERC-20 that anchors its success rate
 *   - an off-chain tokenURI describing capabilities / tooling
 *
 * The registry exposes a single read, `reputationScore(tokenId)`, that
 * proxies through to the AgentToken's rolling success rate. Marketplaces
 * like Virtuals, Wayfinder, and (soon) Base's Agents index can discover
 * Umbrella agents here.
 */
contract UmbrellaAgentRegistry is ERC721URIStorage, Ownable2Step {
    uint256 private _nextTokenId;

    struct AgentProfile {
        string blueprintId;
        address agentToken; // UmbrellaAgentToken address — may be zero before launch
        address operator;   // EOA / smart wallet that operates the agent
        uint64 registeredAt;
    }

    mapping(uint256 tokenId => AgentProfile profile) public profiles;
    mapping(string blueprintId => uint256 tokenId) public tokenIdForBlueprint;

    event AgentRegistered(
        uint256 indexed tokenId,
        string indexed blueprintIdIndexed,
        string blueprintId,
        address indexed operator,
        address agentToken,
        string uri
    );

    event AgentTokenLinked(uint256 indexed tokenId, address indexed agentToken);

    error BlueprintAlreadyRegistered(string blueprintId, uint256 existing);
    error UnknownAgent(uint256 tokenId);
    error ZeroAddress();

    constructor(address owner_) ERC721("Umbrella Agent", "UMBA") Ownable(owner_) {}

    /**
     * @param operator    The smart wallet / EOA that will operate this agent.
     * @param blueprintId Matching Blueprint ID from @umbrella/runner.
     * @param agentToken  Optional AgentToken address; pass address(0) and
     *                    link later via `linkAgentToken`.
     * @param uri         ipfs:// or https:// pointer to the agent's manifest.
     */
    function registerAgent(
        address operator,
        string calldata blueprintId,
        address agentToken,
        string calldata uri
    ) external returns (uint256 tokenId) {
        if (operator == address(0)) revert ZeroAddress();
        uint256 existing = tokenIdForBlueprint[blueprintId];
        if (existing != 0) revert BlueprintAlreadyRegistered(blueprintId, existing);

        tokenId = ++_nextTokenId; // tokenIds start at 1 so "0 means missing" works.
        _safeMint(operator, tokenId);
        _setTokenURI(tokenId, uri);

        profiles[tokenId] = AgentProfile({
            blueprintId: blueprintId,
            agentToken: agentToken,
            operator: operator,
            registeredAt: uint64(block.timestamp)
        });
        tokenIdForBlueprint[blueprintId] = tokenId;

        emit AgentRegistered(tokenId, blueprintId, blueprintId, operator, agentToken, uri);
    }

    /// @notice Attach an AgentToken after the agent has already been registered.
    ///         Only the current holder can link (prevents squatters).
    function linkAgentToken(uint256 tokenId, address agentToken) external {
        _requireOwned(tokenId);
        require(ownerOf(tokenId) == msg.sender, "UmbrellaAgentRegistry: not holder");
        profiles[tokenId].agentToken = agentToken;
        emit AgentTokenLinked(tokenId, agentToken);
    }

    /**
     * @notice Reputation score (0..10_000) reflecting the agent's EMA success
     *         rate. Returns 0 if the agent hasn't linked an AgentToken yet.
     */
    function reputationScore(uint256 tokenId) external view returns (uint32) {
        _requireOwned(tokenId);
        address token = profiles[tokenId].agentToken;
        if (token == address(0)) return 0;
        return IUmbrellaAgentToken(token).successRate();
    }

    function totalAgents() external view returns (uint256) {
        return _nextTokenId;
    }
}
