// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { UmbrellaAgentToken } from "./UmbrellaAgentToken.sol";

/**
 * @title  UmbrellaAgentTokenFactory
 * @notice One-click launcher for agent-backed ERC-20s.
 *
 * The factory is the smallest thing Umbrella needs on-chain to go live:
 *   - Marketplace listings call `tokenFor(blueprintId)` to look up addresses
 *     without hand-maintained config.
 *   - The RelayerService does the same before calling `recordSuccess`.
 *   - End users eventually call `createAgentToken` from the /app/launch page;
 *     CDP Paymaster covers their gas.
 *
 * The deterministic CREATE2 flow means a blueprint's token address is known
 * *before* deployment — invaluable for front-running-free pool seeding and
 * for pre-announcing ticker addresses in the UI.
 */
contract UmbrellaAgentTokenFactory is Ownable2Step {
    /// @notice Attester address every token created by this factory trusts
    ///         by default. Can be overridden per-token with `createAgentTokenAdvanced`.
    address public defaultAttester;

    /// @notice blueprintId → AgentToken. Empty address means not yet launched.
    mapping(string blueprintId => address token) public tokenFor;
    /// @notice Destination for launch fees paid via `createAgentToken`.
    address payable public treasury;
    /// @notice Fee charged on public launches (default 0.005 ether in deploy script).
    uint256 public launchFeeWei;

    /// @notice Index of every token ever deployed, in launch order.
    address[] public allTokens;

    event AgentTokenCreated(
        string indexed blueprintIdIndexed,
        string blueprintId,
        address indexed token,
        address indexed deployer,
        string name,
        string symbol,
        address attester,
        uint256 initialSupply
    );

    event DefaultAttesterUpdated(address indexed oldAttester, address indexed newAttester);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event LaunchFeeUpdated(uint256 oldFeeWei, uint256 newFeeWei);
    event LaunchFeePaid(address indexed payer, uint256 amountWei);

    error BlueprintAlreadyLaunched(string blueprintId, address existing);
    error ZeroAddress();
    error EmptyBlueprint();
    error InsufficientLaunchFee(uint256 requiredWei, uint256 sentWei);
    error EthTransferFailed();

    constructor(
        address owner_,
        address defaultAttester_,
        address payable treasury_,
        uint256 launchFeeWei_
    ) Ownable(owner_) {
        if (owner_ == address(0) || defaultAttester_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        defaultAttester = defaultAttester_;
        treasury = treasury_;
        launchFeeWei = launchFeeWei_;
    }

    /**
     * @notice Launch a new AgentToken for a blueprint using the factory's
     *         default attester and sending the initial supply to `msg.sender`.
     *         Perfect for the "Launch your agent" button in the web UI.
     */
    function createAgentToken(
        string calldata name_,
        string calldata symbol_,
        string calldata blueprintId_,
        uint256 initialSupply
    ) external payable returns (address token) {
        uint256 fee = launchFeeWei;
        if (msg.value < fee) revert InsufficientLaunchFee(fee, msg.value);
        if (fee > 0) {
            (bool ok, ) = treasury.call{value: fee}("");
            if (!ok) revert EthTransferFailed();
            emit LaunchFeePaid(msg.sender, fee);
        }
        return _deploy(name_, symbol_, blueprintId_, defaultAttester, msg.sender, initialSupply);
    }

    /**
     * @notice Launch with a custom attester + recipient. Used by Umbrella itself
     *         to bootstrap registry entries where the recipient is a treasury
     *         multisig and the attester is a TEE key distinct from the relayer.
     */
    function createAgentTokenAdvanced(
        string calldata name_,
        string calldata symbol_,
        string calldata blueprintId_,
        address attester_,
        address recipient,
        uint256 initialSupply
    ) external onlyOwner returns (address token) {
        return _deploy(name_, symbol_, blueprintId_, attester_, recipient, initialSupply);
    }

    function setDefaultAttester(address newAttester) external onlyOwner {
        if (newAttester == address(0)) revert ZeroAddress();
        emit DefaultAttesterUpdated(defaultAttester, newAttester);
        defaultAttester = newAttester;
    }

    function setTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setLaunchFeeWei(uint256 newFeeWei) external onlyOwner {
        emit LaunchFeeUpdated(launchFeeWei, newFeeWei);
        launchFeeWei = newFeeWei;
    }

    // --- views --------------------------------------------------------------

    function totalTokens() external view returns (uint256) {
        return allTokens.length;
    }

    /// @notice Precompute the CREATE2 address a token would deploy to.
    function predictTokenAddress(
        string calldata name_,
        string calldata symbol_,
        string calldata blueprintId_,
        address attester_,
        address owner_,
        uint256 initialSupply
    ) external view returns (address) {
        bytes32 salt = _saltFor(blueprintId_);
        bytes memory creationCode = abi.encodePacked(
            type(UmbrellaAgentToken).creationCode,
            abi.encode(name_, symbol_, blueprintId_, attester_, owner_, initialSupply)
        );
        bytes32 hash_ = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(creationCode))
        );
        return address(uint160(uint256(hash_)));
    }

    // --- internals ----------------------------------------------------------

    function _deploy(
        string memory name_,
        string memory symbol_,
        string memory blueprintId_,
        address attester_,
        address recipient,
        uint256 initialSupply
    ) internal returns (address token) {
        if (bytes(blueprintId_).length == 0) revert EmptyBlueprint();
        address existing = tokenFor[blueprintId_];
        if (existing != address(0)) revert BlueprintAlreadyLaunched(blueprintId_, existing);
        if (attester_ == address(0) || recipient == address(0)) revert ZeroAddress();

        bytes32 salt = _saltFor(blueprintId_);
        token = address(
            new UmbrellaAgentToken{ salt: salt }(
                name_, symbol_, blueprintId_, attester_, recipient, initialSupply
            )
        );

        tokenFor[blueprintId_] = token;
        allTokens.push(token);

        emit AgentTokenCreated(
            blueprintId_, blueprintId_, token, msg.sender, name_, symbol_, attester_, initialSupply
        );
    }

    function _saltFor(string memory blueprintId_) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("umbrella.agent-token.v1:", blueprintId_));
    }
}
