// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {TransientStateLibrary} from "v4-core/libraries/TransientStateLibrary.sol";
import {CurrencySettler} from "../../lib/v4-core/test/utils/CurrencySettler.sol";

/**
 * @title UmbrellaV4Router
 * @notice Unlock-router for `PoolManager.modifyLiquidity`, patterned after Uniswap v4 test
 *         `PoolModifyLiquidityTest` + `CurrencySettler`. Use for Umbrella swarm / relayer
 *         bootstrap of v4 pools.
 * @dev Liquidity positions are **owned by this contract** (same as the core test router).
 *      For end-user LP NFTs, integrate Uniswap v4 **PositionManager** on-chain instead.
 */
contract UmbrellaV4Router is IUnlockCallback {
    using CurrencySettler for Currency;
    using Hooks for IHooks;
    using TransientStateLibrary for IPoolManager;
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;

    error NotPoolManager();

    struct CallbackData {
        address payer;
        PoolKey key;
        ModifyLiquidityParams params;
        bytes hookData;
    }

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    /// @notice Adds or removes liquidity; `payer` must have approved this contract (or send ETH for native).
    function modifyLiquidity(PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata hookData)
        external
        payable
        returns (BalanceDelta delta)
    {
        PoolKey memory k = key;
        ModifyLiquidityParams memory p = params;
        bytes memory hd = hookData;

        delta = abi.decode(
            poolManager.unlock(abi.encode(CallbackData(msg.sender, k, p, hd))), (BalanceDelta)
        );

        uint256 ethRefund = address(this).balance;
        if (ethRefund > 0) {
            CurrencyLibrary.ADDRESS_ZERO.transfer(msg.sender, ethRefund);
        }
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        CallbackData memory data = abi.decode(rawData, (CallbackData));

        (BalanceDelta delta,) = poolManager.modifyLiquidity(data.key, data.params, data.hookData);

        int256 delta0 = poolManager.currencyDelta(address(this), data.key.currency0);
        int256 delta1 = poolManager.currencyDelta(address(this), data.key.currency1);

        if (delta0 < 0) {
            data.key.currency0.settle(poolManager, data.payer, uint256(-delta0), false);
        }
        if (delta1 < 0) {
            data.key.currency1.settle(poolManager, data.payer, uint256(-delta1), false);
        }
        if (delta0 > 0) {
            data.key.currency0.take(poolManager, data.payer, uint256(delta0), false);
        }
        if (delta1 > 0) {
            data.key.currency1.take(poolManager, data.payer, uint256(delta1), false);
        }

        return abi.encode(delta);
    }
}
