// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";

import { UmbrellaAgentToken } from "../src/UmbrellaAgentToken.sol";
import { UmbrellaAgentTokenFactory } from "../src/UmbrellaAgentTokenFactory.sol";
import { UmbrellaAgentRegistry } from "../src/UmbrellaAgentRegistry.sol";

/**
 * @title  DeployUmbrella
 * @notice Primary deploy script for the Umbrella core stack.
 *
 * It intentionally leaves the Uniswap v4 hook deploy to a second script
 * (DeployHook.s.sol, added in the Sepolia v4 activation run) because:
 *   - hook deployment requires HookMiner to find a salt whose resulting
 *     address has the right trailing bits for beforeSwap + afterSwap.
 *   - V4 PoolManager addresses on Base are still being finalized; mining
 *     against a mainnet-frozen PoolManager address gives cleaner runs.
 *
 * What this script produces:
 *   1. UmbrellaAgentRegistry deployed and owned by DEPLOYER.
 *   2. UmbrellaAgentTokenFactory deployed and owned by DEPLOYER.
 *   3. A set of "genesis" AgentTokens for the blueprints Umbrella ships with
 *      — one per entry in DEFAULT_BLUEPRINTS — so the relayer has something to
 *      anchor to on day one.
 *   4. A JSON file at broadcast/<chain>/DeployUmbrella.s.sol/run-latest.json
 *      that scripts/sync-registry.ts reads to update
 *      platform/apps/api/config/agent-registry.json automatically.
 *
 * Usage:
 *   $ cd platform/contracts
 *   $ cp .env.example .env && $EDITOR .env
 *   $ pnpm deploy:sepolia
 */
contract DeployUmbrella is Script {
    struct BlueprintGenesis {
        string blueprintId;
        string name;
        string symbol;
        uint256 initialSupply; // use 0 for bonding-curve style launches
    }

    function run()
        external
        returns (
            UmbrellaAgentRegistry registry,
            UmbrellaAgentTokenFactory factory,
            address[] memory tokens
        )
    {
        address attester = vm.envAddress("ATTESTER_ADDRESS");
        require(attester != address(0), "ATTESTER_ADDRESS required");
        address payable treasury = payable(vm.envAddress("UMBRELLA_TREASURY"));
        uint256 launchFeeWei = vm.envOr("LAUNCH_FEE_WEI", uint256(0.005 ether));

        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        console2.log("Deployer:", deployer);
        console2.log("Attester:", attester);
        console2.log("Chain id:", block.chainid);

        BlueprintGenesis[] memory blueprints = _defaultBlueprints();

        vm.startBroadcast(deployerPk);

        registry = new UmbrellaAgentRegistry(deployer);
        console2.log("UmbrellaAgentRegistry:", address(registry));

        factory = new UmbrellaAgentTokenFactory(deployer, attester, treasury, launchFeeWei);
        console2.log("UmbrellaAgentTokenFactory:", address(factory));

        tokens = new address[](blueprints.length);
        for (uint256 i = 0; i < blueprints.length; i++) {
            BlueprintGenesis memory b = blueprints[i];
            address tokenAddr = factory.createAgentToken{ value: launchFeeWei }(
                b.name, b.symbol, b.blueprintId, b.initialSupply
            );
            tokens[i] = tokenAddr;
            console2.log(string.concat("  ", b.blueprintId, " (", b.symbol, ") ->"), tokenAddr);

            // Register an agent NFT right away so the marketplace + registry
            // stay in sync with the tokens the relayer knows about.
            registry.registerAgent(
                deployer,
                b.blueprintId,
                tokenAddr,
                string.concat("https://umbrella.dev/agents/", b.blueprintId, "/manifest.json")
            );
        }

        vm.stopBroadcast();
    }

    // Single source of truth for the initial agent suite. Keep this in sync
    // with platform/apps/api/config/agent-registry.json (sync-registry.ts
    // writes the addresses back after each deploy).
    function _defaultBlueprints() internal pure returns (BlueprintGenesis[] memory) {
        BlueprintGenesis[] memory b = new BlueprintGenesis[](4);
        b[0] = BlueprintGenesis({
            blueprintId: "competitor-scrape",
            name: "Umbrella Recon",
            symbol: "uRCN",
            initialSupply: 1_000_000e18
        });
        b[1] = BlueprintGenesis({
            blueprintId: "rwa-scanner",
            name: "Umbrella RWA Scanner",
            symbol: "uRWA",
            initialSupply: 1_000_000e18
        });
        b[2] = BlueprintGenesis({
            blueprintId: "terminal-feed",
            name: "Umbrella Terminal Feed",
            symbol: "uFEED",
            initialSupply: 1_000_000e18
        });
        b[3] = BlueprintGenesis({
            blueprintId: "alpha-scribe",
            name: "Umbrella Alpha Scribe",
            symbol: "uSCRB",
            initialSupply: 1_000_000e18
        });
        return b;
    }
}
