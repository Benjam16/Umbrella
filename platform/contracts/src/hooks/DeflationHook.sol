// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "v4-core/types/PoolId.sol";
import { BalanceDelta, BalanceDeltaLibrary } from "v4-core/types/BalanceDelta.sol";
import { BeforeSwapDelta } from "v4-core/types/BeforeSwapDelta.sol";
import { ModifyLiquidityParams, SwapParams } from "v4-core/types/PoolOperation.sol";

/**
 * @title DeflationHook
 * @notice Uniswap v4 hook that records a configurable burn rate on every swap.
 * `burnBps` is **mutable** so the owner or a delegated `burnOperator` (e.g. swarm
 * orchestrator smart account) can tune strategy on-chain (“aggressive burn” vs “low tax”).
 *
 * The actual “send to 0xdead” path typically uses `afterSwap` + return-delta or
 * an external `syncBurn` called by an authorized agent; v4 accounting is subtle,
 * so this v1 emits rich events for your swarm / indexer to act on-chain or off-chain.
 *
 * Hook address **must** be mined so low 14 bits include `AFTER_SWAP_FLAG` only.
 */
contract DeflationHook is IHooks {
    using Hooks for IHooks;
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;

    IPoolManager public immutable poolManager;

    /// @notice Burn tax in basis points of the **unspecified** leg (e.g. output on exact-in swap).
    uint256 public burnBps;

    address public immutable owner;

    /// @notice Optional hot wallet / multisig / swarm coordinator allowed to tune `burnBps` (in addition to `owner`).
    address public burnOperator;

    event DeflationSwap(
        PoolId indexed poolId,
        int128 amount0,
        int128 amount1,
        uint256 burnBps,
        uint256 hypotheticalBurn0,
        uint256 hypotheticalBurn1
    );

    event BurnBpsUpdated(uint256 previousBps, uint256 newBps);
    event BurnOperatorUpdated(address indexed newOperator);

    error NotPoolManager();
    error OnlyOwner();
    error OnlyOwnerOrBurnOperator();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyOwnerOrBurnOperator() {
        if (msg.sender != owner) {
            if (burnOperator == address(0) || msg.sender != burnOperator) revert OnlyOwnerOrBurnOperator();
        }
        _;
    }

    constructor(IPoolManager _poolManager, uint256 _burnBps, address _owner) {
        require(_burnBps <= 10_000, "DeflationHook: bps");
        poolManager = _poolManager;
        burnBps = _burnBps;
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
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    /// @notice Update burn rate (basis points). Callable by `owner` or `burnOperator` when set.
    function setBurnBps(uint256 newBps) external onlyOwnerOrBurnOperator {
        require(newBps <= 10_000, "DeflationHook: bps");
        uint256 old = burnBps;
        burnBps = newBps;
        emit BurnBpsUpdated(old, newBps);
    }

    /// @notice Set or clear the delegated operator (swarm / automation). Only `owner`.
    function setBurnOperator(address newOperator) external onlyOwner {
        burnOperator = newOperator;
        emit BurnOperatorUpdated(newOperator);
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        BalanceDelta delta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        uint256 bps = burnBps;
        int128 a0 = delta.amount0();
        int128 a1 = delta.amount1();
        uint256 abs0 = a0 >= 0 ? uint256(uint128(a0)) : uint256(uint128(-a0));
        uint256 abs1 = a1 >= 0 ? uint256(uint128(a1)) : uint256(uint128(-a1));
        uint256 h0 = abs0 * bps / 10_000;
        uint256 h1 = abs1 * bps / 10_000;
        emit DeflationSwap(key.toId(), a0, a1, bps, h0, h1);
        return (IHooks.afterSwap.selector, 0);
    }

    // --- unused IHooks (must be external for interface) ---------------------------------

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
