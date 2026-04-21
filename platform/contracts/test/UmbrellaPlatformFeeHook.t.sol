// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { Deployers } from "../lib/v4-core/test/utils/Deployers.sol";
import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";
import { PoolIdLibrary } from "v4-core/types/PoolId.sol";
import { PoolSwapTest } from "../lib/v4-core/src/test/PoolSwapTest.sol";

import { UmbrellaPlatformFeeHook } from "../src/hooks/UmbrellaPlatformFeeHook.sol";

/// @notice CREATE2-deploys the hook at a mined address so constructor `validateHookPermissions` succeeds.
contract UmbrellaPlatformFeeHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    uint160 internal constant REQUIRED_FLAGS =
        uint160(Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG);
    uint160 internal constant HOOK_MASK = uint160((1 << 14) - 1);

    address public treasury = makeAddr("treasury");

    function setUp() public {
        initializeManagerRoutersAndPoolsWithLiq(IHooks(address(0)));
    }

    function _mineCreate2(address deployer, bytes32 initCodeHash)
        internal
        pure
        returns (address predicted, bytes32 salt)
    {
        for (uint256 i = 0; i < 5_000_000; i++) {
            salt = bytes32(i);
            predicted = address(
                uint160(
                    uint256(
                        keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash))
                    )
                )
            );
            if (predicted == address(0)) continue;
            if ((uint160(predicted) & HOOK_MASK) == REQUIRED_FLAGS) {
                return (predicted, salt);
            }
        }
        revert("no salt");
    }

    function _deployHookViaCreate2(uint256 feeBps, uint256 creatorShareOfFeeBps)
        internal
        returns (UmbrellaPlatformFeeHook hook)
    {
        bytes memory initCode = abi.encodePacked(
            type(UmbrellaPlatformFeeHook).creationCode,
            abi.encode(manager, treasury, feeBps, creatorShareOfFeeBps, address(this))
        );
        bytes32 initCodeHash = keccak256(initCode);
        (address mined, bytes32 salt) = _mineCreate2(address(this), initCodeHash);
        hook = new UmbrellaPlatformFeeHook{ salt: salt }(
            manager, treasury, feeBps, creatorShareOfFeeBps, address(this)
        );
        assertEq(address(hook), mined, "CREATE2 hook address");
        (key,) = initPoolAndAddLiquidity(currency0, currency1, IHooks(address(hook)), 100, SQRT_PRICE_1_1);
    }

    /// @notice No creator registered → treasury receives 100% of the skim (creator share bps ignored).
    function test_platformFee_noCreator_allToTreasury() public {
        _deployHookViaCreate2(123, 4000);
        uint256 b0Before = currency0.balanceOf(address(this));
        uint256 b1Before = currency1.balanceOf(address(this));
        uint256 t1Before = currency1.balanceOf(treasury);

        uint256 amountToSwap = 1000;
        PoolSwapTest.TestSettings memory settings =
            PoolSwapTest.TestSettings({ takeClaims: false, settleUsingBurn: false });
        SwapParams memory params =
            SwapParams({ zeroForOne: true, amountSpecified: -int256(amountToSwap), sqrtPriceLimitX96: SQRT_PRICE_1_2 });
        swapRouter.swap(key, params, settings, ZERO_BYTES);

        uint256 outBeforePlatform = 998;
        uint256 feeOnOutput = outBeforePlatform * 123 / 10_000;

        assertEq(currency0.balanceOf(address(this)), b0Before - amountToSwap, "input leg");
        assertEq(currency1.balanceOf(address(this)), b1Before + (outBeforePlatform - feeOnOutput), "output to swapper");
        assertEq(currency1.balanceOf(treasury), t1Before + feeOnOutput, "treasury fee");
    }

    /// @notice Registered creator → 60% of skim to treasury, 40% to creator (with default 4000 bps creator share).
    function test_platformFee_split_creatorAndTreasury() public {
        UmbrellaPlatformFeeHook hook = _deployHookViaCreate2(123, 4000);
        address creator = makeAddr("creator");
        hook.registerPool(key, creator);

        uint256 b0Before = currency0.balanceOf(address(this));
        uint256 b1Before = currency1.balanceOf(address(this));
        uint256 t1Before = currency1.balanceOf(treasury);
        uint256 c1Before = currency1.balanceOf(creator);

        uint256 amountToSwap = 1000;
        PoolSwapTest.TestSettings memory settings =
            PoolSwapTest.TestSettings({ takeClaims: false, settleUsingBurn: false });
        SwapParams memory params =
            SwapParams({ zeroForOne: true, amountSpecified: -int256(amountToSwap), sqrtPriceLimitX96: SQRT_PRICE_1_2 });
        swapRouter.swap(key, params, settings, ZERO_BYTES);

        uint256 outBeforePlatform = 998;
        uint256 totalFee = outBeforePlatform * 123 / 10_000;
        uint256 creatorPart = totalFee * 4000 / 10_000;
        uint256 treasuryPart = totalFee - creatorPart;

        assertEq(currency0.balanceOf(address(this)), b0Before - amountToSwap, "input leg");
        assertEq(currency1.balanceOf(address(this)), b1Before + (outBeforePlatform - totalFee), "output to swapper");
        assertEq(currency1.balanceOf(treasury), t1Before + treasuryPart, "treasury 60%");
        assertEq(currency1.balanceOf(creator), c1Before + creatorPart, "creator 40%");
    }

    /// @notice `poolRegistrar` may register pools without owner key.
    function test_registerPool_viaRegistrar() public {
        UmbrellaPlatformFeeHook hook = _deployHookViaCreate2(10, 5000);
        address registrar = makeAddr("registrar");
        address creator = makeAddr("creator2");
        hook.setPoolRegistrar(registrar);

        vm.prank(registrar);
        hook.registerPool(key, creator);
        assertEq(hook.poolCreators(key.toId()), creator);
    }
}
