// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";

import { UmbrellaAgentRegistry } from "../src/UmbrellaAgentRegistry.sol";
import { UmbrellaAgentToken } from "../src/UmbrellaAgentToken.sol";
import { MissionProofLib } from "../src/libraries/MissionProofLib.sol";

contract UmbrellaAgentRegistryTest is Test {
    UmbrellaAgentRegistry internal registry;
    UmbrellaAgentToken internal token;
    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");
    address internal attester;
    uint256 internal attesterKey;

    function setUp() public {
        (attester, attesterKey) = makeAddrAndKey("attester");
        registry = new UmbrellaAgentRegistry(owner);
        token = new UmbrellaAgentToken("A", "A", "alpha", attester, owner, 0);
    }

    function test_registerAgent_mintsAndLinks() public {
        uint256 id = registry.registerAgent(operator, "alpha", address(token), "ipfs://manifest");
        assertEq(id, 1);
        assertEq(registry.ownerOf(id), operator);
        assertEq(registry.tokenURI(id), "ipfs://manifest");
        assertEq(registry.tokenIdForBlueprint("alpha"), 1);
        assertEq(registry.reputationScore(id), 0, "no anchors yet");
    }

    function test_registerAgent_rejectsDuplicate() public {
        registry.registerAgent(operator, "alpha", address(token), "ipfs://a");
        vm.expectRevert();
        registry.registerAgent(operator, "alpha", address(token), "ipfs://b");
    }

    function test_linkAgentToken_onlyHolder() public {
        uint256 id = registry.registerAgent(operator, "alpha", address(0), "ipfs://a");
        vm.expectRevert();
        registry.linkAgentToken(id, address(token));
        vm.prank(operator);
        registry.linkAgentToken(id, address(token));
    }

    function test_reputationScore_reflectsTokenStats() public {
        uint256 id = registry.registerAgent(operator, "alpha", address(token), "ipfs://a");

        MissionProofLib.MissionProof memory p = MissionProofLib.MissionProof({
            version: 1,
            runIdHash: keccak256("r1"),
            blueprintIdHash: keccak256("alpha"),
            ownerHash: keccak256("owner"),
            successScore: 9100,
            revenueCents: 7,
            nodesExecuted: 1,
            durationSeconds: 1,
            status: 1,
            mintedAt: 1
        });
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", token.domainSeparatorV4(), MissionProofLib.hash(p))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attesterKey, digest);
        token.recordSuccess(p, abi.encodePacked(r, s, v));

        assertEq(registry.reputationScore(id), 9100);
    }
}
