// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { MissionProofLib } from "./libraries/MissionProofLib.sol";
import { IUmbrellaAgentToken } from "./interfaces/IUmbrellaAgentToken.sol";

/**
 * @title  UmbrellaAgentToken
 * @notice An ERC-20 whose economic story is fully anchored to a specific
 *         Umbrella Blueprint's on-chain mission history.
 *
 * The Proof-of-Work Bridge:
 *   1. An off-chain Umbrella mission runs (cloud sandbox or paired CLI node).
 *   2. The RelayerService builds a `MissionProof` and signs it via EIP-712.
 *   3. Anyone calls `recordSuccess(proof, signature)` — typically the relayer
 *      itself, sponsored by the CDP Paymaster so the hot wallet never needs ETH.
 *   4. The contract verifies the signature came from the configured `attester`,
 *      guards against replay using `runIdHash`, and updates the rolling stats
 *      that the Uniswap v4 Performance Hook reads to set dynamic swap fees.
 *
 * Why rolling (not raw) stats?
 *   - `successRate` is an EMA so a single flop doesn't dominate the hook's fee
 *     calculation. The alpha is fixed at 20% (weight on the newest mission).
 *   - `totalRevenueCents` is monotonic so holders can build lifetime charts.
 *
 * Key safety properties:
 *   - `recordSuccess` is permissionless to CALL but cryptographically gated by
 *     the attester signature — anyone can relay, only the attester can attest.
 *   - Each `runIdHash` can anchor exactly once (replay guard).
 *   - The attester is rotatable by the contract owner (Factory → eventually a
 *     timelock/DAO) so a compromised relayer key can be revoked.
 *   - Treasury funds (for buyback / sponsorship / airdrops) live on the token
 *     itself; only the owner can disburse, and every disbursement emits an
 *     auditable reason.
 */
contract UmbrellaAgentToken is ERC20Permit, Ownable2Step, IUmbrellaAgentToken {
    using MissionProofLib for MissionProofLib.MissionProof;

    // --- immutable + public config -----------------------------------------

    /// @notice Identifier of the Umbrella Blueprint this token is backed by.
    string public blueprintId;

    /// @notice Address authorized to sign `MissionProof`s.
    address public attester;

    /// @notice Optional Uniswap v4 hook with read access for dynamic fees.
    ///         Purely informational; the hook itself only needs `successRate`.
    address public performanceHook;

    /// @notice Supply minted once in the constructor. There is no public `mint`;
    ///         subsequent supply changes are only via transfers, user burns, or
    ///         `burnTreasuryTokens` on the contract float.
    uint256 public immutable initialMintedSupply;

    // --- rolling stats -----------------------------------------------------

    /// @inheritdoc IUmbrellaAgentToken
    uint32 public successRate; // basis points 0..10_000

    /// @inheritdoc IUmbrellaAgentToken
    uint256 public totalMissions;

    /// @inheritdoc IUmbrellaAgentToken
    uint256 public successfulMissions;

    /// @inheritdoc IUmbrellaAgentToken
    uint256 public totalRevenueCents;

    /// @inheritdoc IUmbrellaAgentToken
    uint64 public lastMissionAt;

    /// @dev EMA weight applied to each new successScore. 2000 = 20%.
    uint256 public constant EMA_ALPHA_BPS = 2000;

    /// @dev Replay guard: one anchor per run.
    mapping(bytes32 runIdHash => bool anchored) public anchored;

    // --- errors -------------------------------------------------------------

    error InvalidProofVersion(uint8 got);
    error InvalidSignature();
    error ProofAlreadyAnchored(bytes32 runIdHash);
    error InvalidStatus(uint8 got);
    error ScoreOutOfRange(uint32 got);
    error ZeroAddress();
    error InsufficientTreasury(uint256 have, uint256 want);

    /**
     * @param name_         ERC-20 display name, e.g. "Umbrella · Alpha Scribe".
     * @param symbol_       ERC-20 ticker, e.g. "uSCRB".
     * @param blueprintId_  Matching Blueprint ID from @umbrella/runner.
     * @param attester_     Address that will sign `MissionProof`s off-chain.
     * @param owner_        Initial owner (Factory → eventually multisig/DAO).
     * @param initialSupply Initial mint, sent to `owner_`. Use 0 for bonding-curve style launches.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        string memory blueprintId_,
        address attester_,
        address owner_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) ERC20Permit(name_) Ownable(owner_) {
        if (attester_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        blueprintId = blueprintId_;
        attester = attester_;
        initialMintedSupply = initialSupply;
        if (initialSupply > 0) _mint(owner_, initialSupply);
    }

    // -----------------------------------------------------------------------
    // Proof-of-Success anchor
    // -----------------------------------------------------------------------

    /**
     * @notice Anchor a signed mission outcome. Reverts if the proof is
     *         malformed, the signer isn't the authorized attester, or the
     *         runIdHash has already been used.
     *
     * Gas footprint: ~65k on first anchor (cold sstore), ~48k when overwriting
     * a warm `successRate` slot. Well within CDP Paymaster sponsorship bounds.
     */
    function recordSuccess(MissionProofLib.MissionProof calldata proof, bytes calldata signature) external {
        if (proof.version != 1) revert InvalidProofVersion(proof.version);
        if (proof.status != 1 && proof.status != 2) revert InvalidStatus(proof.status);
        if (proof.successScore > 10_000) revert ScoreOutOfRange(proof.successScore);
        if (anchored[proof.runIdHash]) revert ProofAlreadyAnchored(proof.runIdHash);

        bytes32 digest = _hashTypedDataV4(proof.hash());
        address signer = ECDSA.recover(digest, signature);
        if (signer != attester) revert InvalidSignature();

        anchored[proof.runIdHash] = true;

        unchecked {
            totalMissions += 1;
            if (proof.status == 1) successfulMissions += 1;
            // `totalRevenueCents` is capped well below 2**256; unchecked is safe.
            totalRevenueCents += proof.revenueCents;
        }

        // Update the EMA. First anchor seeds the series directly.
        uint32 nextRate;
        if (totalMissions == 1) {
            nextRate = proof.successScore;
        } else {
            // rate = (1-alpha) * old + alpha * score, in basis points.
            uint256 blended = (
                uint256(successRate) * (10_000 - EMA_ALPHA_BPS)
                    + uint256(proof.successScore) * EMA_ALPHA_BPS
            ) / 10_000;
            nextRate = uint32(blended);
        }
        successRate = nextRate;
        lastMissionAt = uint64(block.timestamp);

        emit MissionSuccess(
            digest, proof.runIdHash, proof.successScore, proof.revenueCents, proof.nodesExecuted
        );
    }

    // -----------------------------------------------------------------------
    // Treasury (funded by the hook's afterSwap + direct deposits)
    // -----------------------------------------------------------------------

    /// @notice Any ETH sent here becomes treasury — the hook can call this.
    receive() external payable {
        emit TreasuryFunded(msg.sender, msg.value);
    }

    /**
     * @notice Owner-only withdrawal. Every call records a reason string so the
     *         public can audit "where did the swap-fee buybacks go?".
     */
    function spendTreasury(address payable to, uint256 amount, string calldata reason) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = address(this).balance;
        if (amount > bal) revert InsufficientTreasury(bal, amount);
        (bool ok, ) = to.call{ value: amount }("");
        require(ok, "UmbrellaAgentToken: transfer failed");
        emit TreasurySpent(to, amount, reason);
    }

    /// @notice Owner-only burn of tokens held in the contract (buyback-and-burn).
    function burnTreasuryTokens(uint256 amount) external onlyOwner {
        _burn(address(this), amount);
    }

    // -----------------------------------------------------------------------
    // Governance knobs
    // -----------------------------------------------------------------------

    function rotateAttester(address newAttester) external onlyOwner {
        if (newAttester == address(0)) revert ZeroAddress();
        emit AttesterRotated(attester, newAttester);
        attester = newAttester;
    }

    function setPerformanceHook(address hook) external onlyOwner {
        performanceHook = hook;
        emit HookSet(hook);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    /// @notice Convenience: returns everything the hook + marketplace read.
    function stats()
        external
        view
        returns (
            uint32 rate,
            uint256 missions,
            uint256 successes,
            uint256 revenueCents,
            uint64 lastAt
        )
    {
        return (successRate, totalMissions, successfulMissions, totalRevenueCents, lastMissionAt);
    }

    /// @notice Lets integrators recompute the EIP-712 domain separator off-chain.
    function domainSeparatorV4() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
