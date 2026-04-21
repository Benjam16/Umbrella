// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";

import { UmbrellaAgentTokenFactory } from "../src/UmbrellaAgentTokenFactory.sol";
import { UmbrellaAgentToken } from "../src/UmbrellaAgentToken.sol";
import { MissionProofLib } from "../src/libraries/MissionProofLib.sol";

contract UmbrellaAgentTokenFactoryTest is Test {
    UmbrellaAgentTokenFactory internal factory;
    address internal owner = makeAddr("owner");
    address payable internal treasury = payable(makeAddr("treasury"));
    address internal attester;
    uint256 internal attesterKey;
    address internal user = makeAddr("user");
    uint256 internal constant LAUNCH_FEE = 0.005 ether;

    function setUp() public {
        (attester, attesterKey) = makeAddrAndKey("attester");
        factory = new UmbrellaAgentTokenFactory(owner, attester, treasury, LAUNCH_FEE);
        vm.deal(user, 10 ether);
    }

    function test_createAgentToken_happyPath() public {
        vm.prank(user);
        address tokenAddr = factory.createAgentToken{ value: LAUNCH_FEE }(
            "Umbrella Recon", "uRCN", "competitor-scrape", 500_000e18
        );
        assertTrue(tokenAddr != address(0));
    }

    function test_createAgentToken_chargesLaunchFeeToTreasury() public {
        uint256 beforeTreasury = treasury.balance;
        vm.prank(user);
        address tokenAddr = factory.createAgentToken{ value: LAUNCH_FEE }(
            "Umbrella Recon", "uRCN", "competitor-scrape", 500_000e18
        );
        assertTrue(tokenAddr != address(0));
        assertEq(treasury.balance - beforeTreasury, LAUNCH_FEE);

        UmbrellaAgentToken token = UmbrellaAgentToken(payable(tokenAddr));
        assertEq(token.blueprintId(), "competitor-scrape");
        assertEq(token.attester(), attester);
        assertEq(token.balanceOf(user), 500_000e18);
        // Factory retains no admin rights on the token — user gets the ownership.
        assertEq(token.owner(), user);

        assertEq(factory.tokenFor("competitor-scrape"), tokenAddr);
        assertEq(factory.totalTokens(), 1);
    }

    function test_createAgentToken_rejectsDuplicateBlueprint() public {
        vm.prank(user);
        factory.createAgentToken{ value: LAUNCH_FEE }("A", "A", "dup", 0);
        vm.prank(user);
        vm.expectRevert();
        factory.createAgentToken{ value: LAUNCH_FEE }("B", "B", "dup", 0);
    }

    function test_createAgentToken_rejectsEmptyBlueprint() public {
        vm.prank(user);
        vm.expectRevert(UmbrellaAgentTokenFactory.EmptyBlueprint.selector);
        factory.createAgentToken{ value: LAUNCH_FEE }("A", "A", "", 0);
    }

    function test_createAgentToken_rejectsInsufficientLaunchFee() public {
        vm.prank(user);
        vm.expectRevert(UmbrellaAgentTokenFactory.InsufficientLaunchFee.selector);
        factory.createAgentToken{ value: LAUNCH_FEE - 1 }("A", "A", "fee", 0);
    }

    function test_predictTokenAddress_matchesDeploy() public {
        address predicted = factory.predictTokenAddress(
            "Umbrella Recon", "uRCN", "competitor-scrape", attester, user, 500_000e18
        );
        vm.prank(user);
        address actual = factory.createAgentToken{ value: LAUNCH_FEE }(
            "Umbrella Recon", "uRCN", "competitor-scrape", 500_000e18
        );
        assertEq(predicted, actual, "CREATE2 address prediction must match");
    }

    function test_createAgentTokenAdvanced_ownerOnly() public {
        address recipient = makeAddr("treasury");
        (address customAttester, ) = makeAddrAndKey("custom-att");

        vm.prank(user);
        vm.expectRevert();
        factory.createAgentTokenAdvanced("X", "X", "bp-x", customAttester, recipient, 1);

        vm.prank(owner);
        address tokenAddr = factory.createAgentTokenAdvanced(
            "X", "X", "bp-x", customAttester, recipient, 1e18
        );
        UmbrellaAgentToken token = UmbrellaAgentToken(payable(tokenAddr));
        assertEq(token.attester(), customAttester);
        assertEq(token.balanceOf(recipient), 1e18);
    }

    function test_setDefaultAttester_ownerOnly() public {
        address newAtt = makeAddr("new");
        vm.prank(user);
        vm.expectRevert();
        factory.setDefaultAttester(newAtt);

        vm.prank(owner);
        factory.setDefaultAttester(newAtt);
        assertEq(factory.defaultAttester(), newAtt);
    }

    function test_createdToken_acceptsAttesterSignedProof() public {
        vm.prank(user);
        address tokenAddr = factory.createAgentToken{ value: LAUNCH_FEE }("A", "A", "bp-a", 0);
        UmbrellaAgentToken token = UmbrellaAgentToken(payable(tokenAddr));

        MissionProofLib.MissionProof memory p = MissionProofLib.MissionProof({
            version: 1,
            runIdHash: keccak256("run-first"),
            blueprintIdHash: keccak256("bp-a"),
            ownerHash: keccak256("owner-a"),
            successScore: 9000,
            revenueCents: 100,
            nodesExecuted: 2,
            durationSeconds: 5,
            status: 1,
            mintedAt: 1_700_000_000
        });

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", token.domainSeparatorV4(), MissionProofLib.hash(p))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attesterKey, digest);
        token.recordSuccess(p, abi.encodePacked(r, s, v));
        assertEq(token.successRate(), 9000);
    }
}
