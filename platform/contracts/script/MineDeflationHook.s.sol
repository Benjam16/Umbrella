// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";

import { DeflationHook } from "../src/hooks/DeflationHook.sol";

/**
 * @notice Mines a CREATE2 salt so `DeflationHook` deploys to an address whose
 * trailing 14 bits match **only** `AFTER_SWAP_FLAG` (required by Uniswap v4).
 *
 * Env:
 *   PRIVATE_KEY, V4_POOL_MANAGER
 *   DEFLATION_BURN_BPS (default 100 = 1%)
 *   DEFLATION_HOOK_OWNER (optional, defaults to deployer)
 *
 * Usage:
 *   forge script script/MineDeflationHook.s.sol:MineDeflationHook --rpc-url base_sepolia --broadcast -vvv
 */
contract MineDeflationHook is Script {
    function run() external returns (DeflationHook hook, bytes32 salt) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address pm = vm.envAddress("V4_POOL_MANAGER");
        address owner = vm.envOr("DEFLATION_HOOK_OWNER", deployer);
        uint256 bps = vm.envOr("DEFLATION_BURN_BPS", uint256(100));

        uint160 requiredFlags = uint160(Hooks.AFTER_SWAP_FLAG);
        bytes memory creationCode =
            abi.encodePacked(type(DeflationHook).creationCode, abi.encode(IPoolManager(pm), bps, owner));
        bytes32 initCodeHash = keccak256(creationCode);

        address predicted;
        for (uint256 i = 0; i < 500_000; i++) {
            salt = bytes32(i);
            predicted = _compute(deployer, salt, initCodeHash);
            if ((uint160(predicted) & uint160(0x3fff)) == requiredFlags) {
                vm.startBroadcast(pk);
                hook = new DeflationHook{ salt: salt }(IPoolManager(pm), bps, owner);
                vm.stopBroadcast();
                require(address(hook) == predicted, "address mismatch");
                console2.log("DeflationHook:", address(hook));
                console2.log("Salt:");
                console2.logBytes32(salt);
                return (hook, salt);
            }
        }
        revert("MineDeflationHook: no salt in 500k iterations");
    }

    function _compute(address deployer, bytes32 salt_, bytes32 initCodeHash) internal pure returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt_, initCodeHash))))
        );
    }
}
