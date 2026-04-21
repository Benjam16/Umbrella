// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {SafeCast} from "v4-core/libraries/SafeCast.sol";

/**
 * @title UmbrellaPlatformFeeHook
 * @notice Uniswap v4 hook: **platform skim** (bps of the **unspecified** swap leg, same
 *         pattern as v4-core `FeeTakingHook`), then **Option B — trustless split**:
 *         a configured share of that skim is `take`n to the pool’s **creator**; the rest
 *         goes to **treasury**. If no creator is registered, treasury receives 100%.
 * @dev Hook address **must** be CREATE2-mined (`AFTER_SWAP | AFTER_SWAP_RETURNS_DELTA`).
 *      Use `script/DeployPlatformFeeHook.s.sol`.
 */
contract UmbrellaPlatformFeeHook is IHooks {
    using Hooks for IHooks;
    using PoolIdLibrary for PoolKey;
    using SafeCast for uint256;
    using SafeCast for int128;

    uint256 internal constant BPS_DENOMINATOR = 10_000;

    IPoolManager public immutable poolManager;

    /// @notice Receives the platform’s portion of each skim after creator split.
    address public treasury;

    /// @notice Gross platform fee in bps of the unspecified swap leg (e.g. 80 = 0.8%).
    uint256 public platformFeeBps;

    /// @notice Share of **each skim** that is pushed to the registered creator (rest → treasury).
    ///         e.g. `4000` = 40% to creator, 60% to treasury. `0` = treasury keeps 100%.
    uint256 public immutable creatorShareOfFeeBps;

    address public immutable owner;

    /// @notice Optional hot wallet / relayer / Forge bot allowed to call `registerPool` (owner always can).
    address public poolRegistrar;

    mapping(PoolId => address) public poolCreators;

    event PoolCreatorRegistered(PoolId indexed poolId, address indexed creator);
    event PoolRegistrarUpdated(address indexed previousRegistrar, address indexed newRegistrar);
    event PlatformFeeDistributed(
        bytes32 indexed poolId,
        address indexed feeToken,
        uint256 totalFee,
        uint256 toTreasury,
        uint256 toCreator,
        address indexed creator
    );
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event PlatformFeeBpsUpdated(uint256 previousBps, uint256 newBps);

    error NotPoolManager();
    error OnlyOwner();
    error OnlyOwnerOrRegistrar();
    error FeeBpsTooHigh(uint256 bps, uint256 maxBps);
    error CreatorShareTooHigh(uint256 shareBps, uint256 maxBps);
    error ZeroCreator();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyOwnerOrRegistrar() {
        if (msg.sender == owner) {
            _;
        } else if (poolRegistrar != address(0) && msg.sender == poolRegistrar) {
            _;
        } else {
            revert OnlyOwnerOrRegistrar();
        }
    }

    constructor(
        IPoolManager _poolManager,
        address _treasury,
        uint256 _platformFeeBps,
        uint256 _creatorShareOfFeeBps,
        address _owner
    ) {
        if (_platformFeeBps > 300) revert FeeBpsTooHigh(_platformFeeBps, 300);
        if (_creatorShareOfFeeBps > BPS_DENOMINATOR) {
            revert CreatorShareTooHigh(_creatorShareOfFeeBps, BPS_DENOMINATOR);
        }
        poolManager = _poolManager;
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
        creatorShareOfFeeBps = _creatorShareOfFeeBps;
        owner = _owner;
        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: false,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: true,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    function setTreasury(address newTreasury) external onlyOwner {
        address prev = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(prev, newTreasury);
    }

    function setPlatformFeeBps(uint256 newBps) external onlyOwner {
        if (newBps > 300) revert FeeBpsTooHigh(newBps, 300);
        uint256 prev = platformFeeBps;
        platformFeeBps = newBps;
        emit PlatformFeeBpsUpdated(prev, newBps);
    }

    function setPoolRegistrar(address newRegistrar) external onlyOwner {
        address prev = poolRegistrar;
        poolRegistrar = newRegistrar;
        emit PoolRegistrarUpdated(prev, newRegistrar);
    }

    /// @notice Bind a pool to a creator wallet for fee splits (Sovereign Forge / registrar).
    function registerPool(PoolKey calldata key, address creator) external onlyOwnerOrRegistrar {
        if (creator == address(0)) revert ZeroCreator();
        PoolId pid = key.toId();
        poolCreators[pid] = creator;
        emit PoolCreatorRegistered(pid, creator);
    }

    /// @inheritdoc IHooks
    function afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        uint256 bps = platformFeeBps;
        if (bps == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        bool specifiedTokenIs0 = (params.amountSpecified < 0 == params.zeroForOne);
        (Currency feeCurrency, int128 swapAmount) = specifiedTokenIs0
            ? (key.currency1, delta.amount1())
            : (key.currency0, delta.amount0());
        if (swapAmount < 0) swapAmount = -swapAmount;

        uint256 feeAmount = uint256(uint128(swapAmount)) * bps / BPS_DENOMINATOR;
        if (feeAmount == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        PoolId pid = key.toId();
        address creator = poolCreators[pid];
        uint256 shareBps = creatorShareOfFeeBps;

        if (creator != address(0) && shareBps > 0) {
            uint256 creatorAmt = feeAmount * shareBps / BPS_DENOMINATOR;
            uint256 platformAmt = feeAmount - creatorAmt;
            if (platformAmt > 0) poolManager.take(feeCurrency, treasury, platformAmt);
            if (creatorAmt > 0) poolManager.take(feeCurrency, creator, creatorAmt);
            emit PlatformFeeDistributed(
                PoolId.unwrap(pid),
                Currency.unwrap(feeCurrency),
                feeAmount,
                platformAmt,
                creatorAmt,
                creator
            );
        } else {
            poolManager.take(feeCurrency, treasury, feeAmount);
            emit PlatformFeeDistributed(
                PoolId.unwrap(pid), Currency.unwrap(feeCurrency), feeAmount, feeAmount, 0, address(0)
            );
        }

        return (IHooks.afterSwap.selector, feeAmount.toInt128());
    }

    // --- unused IHooks -----------------------------------------------------------------

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert();
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        revert();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert();
    }
}
