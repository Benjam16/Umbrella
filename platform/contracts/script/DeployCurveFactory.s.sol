// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";

import { UmbrellaCurveFactory } from "../src/UmbrellaCurveFactory.sol";

/**
 * @title  DeployCurveFactory
 * @notice Deploys the pump.fun-style bonding curve factory. Target Base
 *         Sepolia first; promote to Base mainnet behind the
 *         UMBRELLA_LAUNCH_MAINNET_ENABLED flag.
 *
 * Required env:
 *   PRIVATE_KEY                         — deployer key (hot key, low balance)
 *   UMBRELLA_CURVE_TREASURY             — fee + residual recipient
 *   UMBRELLA_V4_ROUTER                  — address of deployed UmbrellaV4Router
 *   UMBRELLA_CURVE_K                    — curve coefficient (wei)
 *   UMBRELLA_GRADUATION_THRESHOLD_WEI   — ETH needed before graduation
 *   UMBRELLA_GRADUATION_SEED_WEI        — ETH routed into v4 pool at graduation
 *   UMBRELLA_CURVE_SWAP_FEE_BPS         — e.g. 100 for 1%
 *   UMBRELLA_CURVE_TREASURY_FEE_BPS     — e.g. 50 for half of the 1% fee
 */
contract DeployCurveFactory is Script {
    function run() external returns (UmbrellaCurveFactory factory) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address payable treasury = payable(vm.envAddress("UMBRELLA_CURVE_TREASURY"));
        address router = vm.envAddress("UMBRELLA_V4_ROUTER");
        uint256 k = vm.envUint("UMBRELLA_CURVE_K");
        uint256 threshold = vm.envUint("UMBRELLA_GRADUATION_THRESHOLD_WEI");
        uint256 seed = vm.envUint("UMBRELLA_GRADUATION_SEED_WEI");
        uint16 swapBps = uint16(vm.envUint("UMBRELLA_CURVE_SWAP_FEE_BPS"));
        uint16 treasuryBps = uint16(vm.envUint("UMBRELLA_CURVE_TREASURY_FEE_BPS"));

        vm.startBroadcast(pk);
        factory = new UmbrellaCurveFactory(
            deployer, treasury, router, k, threshold, seed, swapBps, treasuryBps
        );
        vm.stopBroadcast();
        console2.log("UmbrellaCurveFactory:", address(factory));
    }
}
