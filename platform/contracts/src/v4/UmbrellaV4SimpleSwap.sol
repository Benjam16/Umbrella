// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {TransientStateLibrary} from "v4-core/libraries/TransientStateLibrary.sol";
import {CurrencySettler} from "../../lib/v4-core/test/utils/CurrencySettler.sol";

/**
 * @title UmbrellaV4SimpleSwap
 * @notice Exact-in single-hop swaps on Uniswap v4 `PoolManager`, using the same
 *         unlock + settle pattern as `UmbrellaV4Router` (modifyLiquidity).
 * @dev Deploy per environment; set `NEXT_PUBLIC_UMBRELLA_V4_SWAP_ROUTER_*` in the web app.
 *      Pools are expected to be token/WETH with the same fee/tick/hooks as `buildDefaultPoolKey` in the API.
 */
contract UmbrellaV4SimpleSwap is IUnlockCallback {
    using CurrencySettler for Currency;
    using TransientStateLibrary for IPoolManager;
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;

    IPoolManager public immutable poolManager;

    error NotPoolManager();
    error SlippageOut(uint256 minimum, uint256 got);

    struct CallbackData {
        address payer;
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        uint256 minOut;
        bytes hookData;
    }

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    receive() external payable {}

    /// @notice Exact-in single hop. Approvals: payer must have approved this contract for ERC-20 inputs.
    /// @dev If the input currency is native ETH, send `msg.value == amountIn` on this call.
    function swapExactIn(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint256 minOut,
        bytes calldata hookData
    ) external payable returns (BalanceDelta delta) {
        PoolKey memory k = key;
        bytes memory ret = poolManager.unlock(abi.encode(CallbackData(msg.sender, k, zeroForOne, amountIn, minOut, hookData)));
        delta = abi.decode(ret, (BalanceDelta));
        uint256 refund = address(this).balance;
        if (refund > 0) {
            CurrencyLibrary.ADDRESS_ZERO.transfer(msg.sender, refund);
        }
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        CallbackData memory data = abi.decode(rawData, (CallbackData));

        SwapParams memory sp = SwapParams({
            zeroForOne: data.zeroForOne,
            amountSpecified: -int256(uint256(data.amountIn)),
            sqrtPriceLimitX96: data.zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });

        BalanceDelta delta = poolManager.swap(data.key, sp, data.hookData);

        uint256 outAmt;
        if (data.zeroForOne) {
            int128 a1 = delta.amount1();
            if (a1 <= 0) revert SlippageOut(data.minOut, 0);
            outAmt = uint256(uint128(a1));
        } else {
            int128 a0 = delta.amount0();
            if (a0 <= 0) revert SlippageOut(data.minOut, 0);
            outAmt = uint256(uint128(a0));
        }
        if (outAmt < data.minOut) revert SlippageOut(data.minOut, outAmt);

        int256 d0 = poolManager.currencyDelta(address(this), data.key.currency0);
        int256 d1 = poolManager.currencyDelta(address(this), data.key.currency1);

        if (d0 < 0) {
            data.key.currency0.settle(poolManager, data.payer, uint256(-d0), false);
        }
        if (d1 < 0) {
            data.key.currency1.settle(poolManager, data.payer, uint256(-d1), false);
        }
        if (d0 > 0) {
            data.key.currency0.take(poolManager, data.payer, uint256(d0), false);
        }
        if (d1 > 0) {
            data.key.currency1.take(poolManager, data.payer, uint256(d1), false);
        }

        return abi.encode(delta);
    }
}
