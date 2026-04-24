// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { UmbrellaBondingCurve } from "./UmbrellaBondingCurve.sol";

/**
 * @title  UmbrellaCurveFactory
 * @notice Creates a bonding curve for an already-deployed UmbrellaAgentToken.
 *
 * The creator deploys their token via UmbrellaAgentTokenFactory (minting the
 * full supply to themselves), signs an ERC-2612 permit granting this factory
 * allowance over the entire supply, and then:
 *   - either the creator calls `createCurveWithPermit` directly, or
 *   - the Umbrella launch worker relays the signed permit into this call.
 *
 * Either way the permit is consumed atomically with the token transfer so no
 * sniping window exists where someone can observe the allowance and snipe.
 */
contract UmbrellaCurveFactory is Ownable2Step {
    using SafeERC20 for IERC20;

    // --- config (owner-tunable) --------------------------------------------

    /// @notice Destination for curve fees + graduation residual ETH.
    address payable public treasury;
    /// @notice Bonding curve coefficient — `k * s^2` price, where s = tokensSold / 1e18.
    uint256 public curveK;
    /// @notice ETH reserve required for graduation.
    uint256 public graduationThresholdWei;
    /// @notice ETH moved into the v4 router at graduation.
    uint256 public graduationSeedWei;
    /// @notice Swap fee in basis points.
    uint16 public swapFeeBps;
    /// @notice Portion of swapFeeBps routed to treasury.
    uint16 public treasuryFeeBps;
    /// @notice Address of the Umbrella v4 router used for pool seeding.
    address public v4Router;

    /// @notice token → curve. One curve per token.
    mapping(address token => address curve) public curveFor;
    /// @notice All curves, launch order.
    address[] public allCurves;

    event CurveCreated(
        address indexed token,
        address indexed curve,
        address indexed creator,
        address hookAddress,
        uint256 tokensSeeded
    );
    event ConfigUpdated(
        uint256 curveK,
        uint256 graduationThresholdWei,
        uint256 graduationSeedWei,
        uint16 swapFeeBps,
        uint16 treasuryFeeBps
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event RouterUpdated(address indexed oldRouter, address indexed newRouter);

    error CurveAlreadyExists(address token, address existing);
    error ZeroAddress();
    error TokenSupplyZero();
    error SeedGreaterThanThreshold();
    error EthRefundFailed();

    constructor(
        address owner_,
        address payable treasury_,
        address v4Router_,
        uint256 curveK_,
        uint256 graduationThresholdWei_,
        uint256 graduationSeedWei_,
        uint16 swapFeeBps_,
        uint16 treasuryFeeBps_
    ) Ownable(owner_) {
        if (owner_ == address(0) || treasury_ == address(0) || v4Router_ == address(0)) revert ZeroAddress();
        if (graduationSeedWei_ > graduationThresholdWei_) revert SeedGreaterThanThreshold();
        treasury = treasury_;
        v4Router = v4Router_;
        curveK = curveK_;
        graduationThresholdWei = graduationThresholdWei_;
        graduationSeedWei = graduationSeedWei_;
        swapFeeBps = swapFeeBps_;
        treasuryFeeBps = treasuryFeeBps_;
    }

    // --- public writes -----------------------------------------------------

    /**
     * @notice Deploy a curve for `token`, pulling `tokensSeed` from `creator`
     *         via an existing allowance. Reverts if the creator hasn't
     *         approved this factory.
     */
    function createCurve(
        address token,
        address creator,
        address hookAddress,
        uint256 tokensSeed
    ) public payable returns (address curve) {
        return _createCurveInternal(token, creator, hookAddress, tokensSeed);
    }

    /**
     * @notice Deploy a curve with an ERC-2612 permit — one tx, no approval step.
     */
    function createCurveWithPermit(
        address token,
        address creator,
        address hookAddress,
        uint256 tokensSeed,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable returns (address curve) {
        IERC20Permit(token).permit(creator, address(this), tokensSeed, permitDeadline, v, r, s);
        return _createCurveInternal(token, creator, hookAddress, tokensSeed);
    }

    // --- admin --------------------------------------------------------------

    function setTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setV4Router(address newRouter) external onlyOwner {
        if (newRouter == address(0)) revert ZeroAddress();
        emit RouterUpdated(v4Router, newRouter);
        v4Router = newRouter;
    }

    function setCurveConfig(
        uint256 curveK_,
        uint256 graduationThresholdWei_,
        uint256 graduationSeedWei_,
        uint16 swapFeeBps_,
        uint16 treasuryFeeBps_
    ) external onlyOwner {
        if (graduationSeedWei_ > graduationThresholdWei_) revert SeedGreaterThanThreshold();
        curveK = curveK_;
        graduationThresholdWei = graduationThresholdWei_;
        graduationSeedWei = graduationSeedWei_;
        swapFeeBps = swapFeeBps_;
        treasuryFeeBps = treasuryFeeBps_;
        emit ConfigUpdated(
            curveK_, graduationThresholdWei_, graduationSeedWei_, swapFeeBps_, treasuryFeeBps_
        );
    }

    // --- views -------------------------------------------------------------

    function totalCurves() external view returns (uint256) {
        return allCurves.length;
    }

    function predictCurveAddress(address token) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked("umbrella.curve.v1:", token));
        bytes memory creationCode = abi.encodePacked(
            type(UmbrellaBondingCurve).creationCode,
            abi.encode(
                token,
                address(0),
                address(0),
                treasury,
                v4Router,
                uint256(1),
                curveK,
                graduationThresholdWei,
                graduationSeedWei,
                swapFeeBps,
                treasuryFeeBps
            )
        );
        bytes32 h = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(creationCode))
        );
        return address(uint160(uint256(h)));
    }

    // --- internals ---------------------------------------------------------

    function _createCurveInternal(
        address token,
        address creator,
        address hookAddress,
        uint256 tokensSeed
    ) internal returns (address curve) {
        if (token == address(0) || creator == address(0)) revert ZeroAddress();
        if (tokensSeed == 0) revert TokenSupplyZero();
        address existing = curveFor[token];
        if (existing != address(0)) revert CurveAlreadyExists(token, existing);

        curve = address(
            new UmbrellaBondingCurve(
                token,
                creator,
                hookAddress,
                treasury,
                v4Router,
                tokensSeed,
                curveK,
                graduationThresholdWei,
                graduationSeedWei,
                swapFeeBps,
                treasuryFeeBps
            )
        );

        IERC20(token).safeTransferFrom(creator, curve, tokensSeed);

        curveFor[token] = curve;
        allCurves.push(curve);
        emit CurveCreated(token, curve, creator, hookAddress, tokensSeed);

        uint256 buyEth = msg.value;
        if (buyEth > 0) {
            _initialBuy(curve, creator, buyEth);
        }
    }

    /// @dev Snipes the bonding curve for `recipient` using ETH forwarded in the
    ///      same transaction as `createCurve*`. `msg.value` must be zero in the
    ///      common relayer case (snipe is optional).
    function _initialBuy(address curve, address recipient, uint256 buyEth) internal {
        uint256 tokensOut = UmbrellaBondingCurve(payable(curve)).previewBuyFromEth(buyEth);
        if (tokensOut == 0) {
            (bool ok, ) = payable(msg.sender).call{ value: buyEth }("");
            if (!ok) revert EthRefundFailed();
            return;
        }
        UmbrellaBondingCurve(payable(curve)).buyTo{ value: buyEth }(recipient, tokensOut, buyEth);
    }
}
