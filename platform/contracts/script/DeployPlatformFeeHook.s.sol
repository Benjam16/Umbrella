// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";

import { UmbrellaPlatformFeeHook } from "../src/hooks/UmbrellaPlatformFeeHook.sol";

/**
 * @title DeployPlatformFeeHook
 * @notice CREATE2-mines a salt so `UmbrellaPlatformFeeHook` deploys to an address whose
 *         low 14 bits match **only** `afterSwap` + `afterSwapReturnDelta` (required by Uniswap v4).
 *
 * Env:
 *   PRIVATE_KEY        — deployer (also initial `owner` of the hook)
 *   V4_POOL_MANAGER    — canonical PoolManager on the target chain
 *   TREASURY_ADDRESS          — receives platform portion of each skim
 *   PLATFORM_FEE_BPS         — optional; default 80 (= 0.8% of unspecified leg)
 *   CREATOR_SHARE_OF_FEE_BPS — optional; default 4000 (= 40% of skim to registered creator; rest → treasury)
 */
contract DeployPlatformFeeHook is Script {
    /// @dev Lower 14 bits must match hook permissions exactly (no stray flags).
    uint160 internal constant REQUIRED_FLAGS =
        uint160(Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG);
    uint160 internal constant HOOK_MASK = uint160((1 << 14) - 1);

    function run() external returns (UmbrellaPlatformFeeHook hook) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address pm = vm.envAddress("V4_POOL_MANAGER");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        uint256 feeBps = vm.envOr("PLATFORM_FEE_BPS", uint256(80));
        uint256 creatorShareBps = vm.envOr("CREATOR_SHARE_OF_FEE_BPS", uint256(4000));

        bytes memory creationCode = type(UmbrellaPlatformFeeHook).creationCode;
        bytes memory constructorArgs =
            abi.encode(IPoolManager(pm), treasury, feeBps, creatorShareBps, deployer);
        bytes memory initCode = abi.encodePacked(creationCode, constructorArgs);
        bytes32 initCodeHash = keccak256(initCode);

        (address mined, bytes32 salt) = _mine(deployer, initCodeHash);
        console2.log("Mined hook address:", mined);
        console2.logBytes32(salt);

        vm.startBroadcast(pk);
        hook = new UmbrellaPlatformFeeHook{ salt: salt }(
            IPoolManager(pm), treasury, feeBps, creatorShareBps, deployer
        );
        vm.stopBroadcast();

        require(address(hook) == mined, "DeployPlatformFeeHook: addr mismatch");
        console2.log("UmbrellaPlatformFeeHook:", address(hook));
    }

    function _mine(address deployer, bytes32 initCodeHash)
        internal
        pure
        returns (address hookAddr, bytes32 salt)
    {
        for (uint256 i = 0; i < 5_000_000; i++) {
            salt = bytes32(i);
            hookAddr = _computeCreate2(deployer, salt, initCodeHash);
            if (hookAddr == address(0)) continue;
            if ((uint160(hookAddr) & HOOK_MASK) == REQUIRED_FLAGS) {
                return (hookAddr, salt);
            }
        }
        revert("DeployPlatformFeeHook: no salt (increase search bound)");
    }

    function _computeCreate2(address deployer, bytes32 salt, bytes32 initCodeHash)
        internal
        pure
        returns (address)
    {
        return address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash))
                )
            )
        );
    }
}
