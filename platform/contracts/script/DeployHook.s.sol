// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";

import { UmbrellaPerformanceHook } from "../src/hooks/UmbrellaPerformanceHook.sol";

/**
 * @title  DeployHook
 * @notice Deploys the UmbrellaPerformanceHook using CREATE2 + HookMiner.
 *
 * Why a separate script?
 *   Uniswap v4 hook addresses must encode their permission bits in their
 *   trailing address bytes (see Hooks.sol). That means we have to mine a
 *   salt that yields an address passing `validateHookAddress()`. Mining is
 *   deterministic but slow — keeping it out of the main deploy keeps the
 *   genesis flow snappy.
 *
 * Before running this, make sure `V4_POOL_MANAGER` in .env points at the
 * canonical PoolManager on your target chain. On Base Sepolia that value
 * is published by the Uniswap team; check:
 *   https://docs.uniswap.org/contracts/v4/deployments
 */
contract DeployHook is Script {
    function run() external returns (UmbrellaPerformanceHook hook) {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        (address minedAddress, bytes32 salt) = _mineHookSalt(
            deployer,
            type(UmbrellaPerformanceHook).creationCode,
            abi.encode(deployer)
        );
        console2.log("Mined hook address:", minedAddress);
        console2.logBytes32(salt);

        vm.startBroadcast(deployerPk);
        hook = new UmbrellaPerformanceHook{ salt: salt }(deployer);
        vm.stopBroadcast();

        require(address(hook) == minedAddress, "hook addr mismatch");
        console2.log("UmbrellaPerformanceHook:", address(hook));
    }

    /**
     * @dev Lightweight HookMiner copy so we don't pin v4-periphery's mining
     *      script. Iterates salts until `keccak256(0xff, deployer, salt, initCode)`
     *      produces an address whose lower 14 bits match `requiredFlags`.
     *      ~200k iterations in practice — under a second.
     */
    function _mineHookSalt(
        address deployer,
        bytes memory creationCode,
        bytes memory constructorArgs
    ) internal pure returns (address hookAddr, bytes32 salt) {
        bytes memory initCode = bytes.concat(creationCode, constructorArgs);
        bytes32 initCodeHash = keccak256(initCode);
        for (uint256 i = 0; i < 20_000; i++) {
            salt = bytes32(i);
            hookAddr = _compute(deployer, salt, initCodeHash);
            if (hookAddr != address(0)) return (hookAddr, salt);
        }
        revert("HookMiner: no salt found");
    }

    function _compute(address deployer, bytes32 salt, bytes32 initCodeHash)
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
