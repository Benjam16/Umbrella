// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";

import { UmbrellaV4Router } from "../src/v4/UmbrellaV4Router.sol";

/// @notice Deploy UmbrellaV4Router against canonical PoolManager (e.g. Base Sepolia).
/// Env: PRIVATE_KEY, V4_POOL_MANAGER
contract DeployUmbrellaV4Router is Script {
    function run() external returns (UmbrellaV4Router router) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address pm = vm.envAddress("V4_POOL_MANAGER");

        vm.startBroadcast(pk);
        router = new UmbrellaV4Router(IPoolManager(pm));
        vm.stopBroadcast();

        console2.log("UmbrellaV4Router:", address(router));
    }
}
