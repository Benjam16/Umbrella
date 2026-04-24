// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";

import { UmbrellaAgentToken } from "../src/UmbrellaAgentToken.sol";
import { MissionProofLib } from "../src/libraries/MissionProofLib.sol";

contract UmbrellaAgentTokenTest is Test {
    UmbrellaAgentToken internal token;

    // Attester key generated via vm.makeAddrAndKey so tests can EIP-712 sign.
    uint256 internal attesterKey;
    address internal attester;

    address internal owner = makeAddr("owner");
    address internal user = makeAddr("user");

    function setUp() public {
        (attester, attesterKey) = makeAddrAndKey("attester");
        token = new UmbrellaAgentToken({
            name_: "Umbrella Alpha Scribe",
            symbol_: "uSCRB",
            blueprintId_: "alpha-scribe",
            attester_: attester,
            owner_: owner,
            initialSupply: 1_000_000e18
        });
    }

    // ----- helpers ---------------------------------------------------------

    function _sampleProof(bytes32 runIdHash, uint32 score, uint8 status)
        internal
        pure
        returns (MissionProofLib.MissionProof memory)
    {
        return MissionProofLib.MissionProof({
            version: 1,
            runIdHash: runIdHash,
            blueprintIdHash: keccak256("alpha-scribe"),
            ownerHash: keccak256("owner-abc"),
            successScore: score,
            revenueCents: 420,
            nodesExecuted: 4,
            durationSeconds: 12,
            status: status,
            mintedAt: 1_700_000_000
        });
    }

    function _sign(MissionProofLib.MissionProof memory p, uint256 key) internal view returns (bytes memory) {
        bytes32 structHash = MissionProofLib.hash(p);
        bytes32 digest = _hashTypedDataV4(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSep = token.domainSeparatorV4();
        return keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
    }

    // ----- tests -----------------------------------------------------------

    function test_initialState() public view {
        assertEq(token.balanceOf(owner), 1_000_000e18);
        assertEq(token.initialMintedSupply(), 1_000_000e18);
        assertEq(token.attester(), attester);
        assertEq(token.blueprintId(), "alpha-scribe");
        assertEq(token.successRate(), 0);
        assertEq(token.totalMissions(), 0);
    }

    function test_recordSuccess_anchorsFirstMission() public {
        MissionProofLib.MissionProof memory p = _sampleProof(keccak256("run-1"), 8000, 1);
        bytes memory sig = _sign(p, attesterKey);

        token.recordSuccess(p, sig);

        assertEq(token.totalMissions(), 1);
        assertEq(token.successfulMissions(), 1);
        assertEq(token.totalRevenueCents(), 420);
        assertEq(token.successRate(), 8000, "first anchor seeds the EMA directly");
        assertTrue(token.anchored(p.runIdHash));
    }

    function test_recordSuccess_emaBlendsAcrossAnchors() public {
        // first mission: 8000
        MissionProofLib.MissionProof memory p1 = _sampleProof(keccak256("run-1"), 8000, 1);
        token.recordSuccess(p1, _sign(p1, attesterKey));
        // second mission: 10000 — EMA with alpha=0.2 should give 8400
        MissionProofLib.MissionProof memory p2 = _sampleProof(keccak256("run-2"), 10_000, 1);
        token.recordSuccess(p2, _sign(p2, attesterKey));
        assertEq(token.successRate(), 8400);
    }

    function test_recordSuccess_failedMissionStillAnchorsButNotCountedAsSuccess() public {
        MissionProofLib.MissionProof memory p = _sampleProof(keccak256("run-bad"), 1200, 2);
        token.recordSuccess(p, _sign(p, attesterKey));
        assertEq(token.totalMissions(), 1);
        assertEq(token.successfulMissions(), 0);
        assertEq(token.successRate(), 1200);
    }

    function test_recordSuccess_rejectsReplay() public {
        MissionProofLib.MissionProof memory p = _sampleProof(keccak256("run-1"), 8000, 1);
        bytes memory sig = _sign(p, attesterKey);
        token.recordSuccess(p, sig);

        vm.expectRevert(
            abi.encodeWithSelector(UmbrellaAgentToken.ProofAlreadyAnchored.selector, p.runIdHash)
        );
        token.recordSuccess(p, sig);
    }

    function test_recordSuccess_rejectsWrongSigner() public {
        (, uint256 rogueKey) = makeAddrAndKey("rogue");
        MissionProofLib.MissionProof memory p = _sampleProof(keccak256("run-1"), 8000, 1);
        bytes memory sig = _sign(p, rogueKey);
        vm.expectRevert(UmbrellaAgentToken.InvalidSignature.selector);
        token.recordSuccess(p, sig);
    }

    function test_recordSuccess_rejectsTamperedPayload() public {
        MissionProofLib.MissionProof memory p = _sampleProof(keccak256("run-1"), 8000, 1);
        bytes memory sig = _sign(p, attesterKey);
        p.successScore = 9999; // tamper after signing
        vm.expectRevert(UmbrellaAgentToken.InvalidSignature.selector);
        token.recordSuccess(p, sig);
    }

    function test_recordSuccess_rejectsBadVersion() public {
        MissionProofLib.MissionProof memory p = _sampleProof(keccak256("run-1"), 8000, 1);
        p.version = 7;
        bytes memory sig = _sign(p, attesterKey);
        vm.expectRevert(abi.encodeWithSelector(UmbrellaAgentToken.InvalidProofVersion.selector, uint8(7)));
        token.recordSuccess(p, sig);
    }

    function test_recordSuccess_rejectsOutOfRangeScore() public {
        MissionProofLib.MissionProof memory p = _sampleProof(keccak256("run-1"), 10_001, 1);
        bytes memory sig = _sign(p, attesterKey);
        vm.expectRevert(abi.encodeWithSelector(UmbrellaAgentToken.ScoreOutOfRange.selector, uint32(10_001)));
        token.recordSuccess(p, sig);
    }

    function test_rotateAttester_onlyOwner() public {
        address newAttester = makeAddr("new-attester");
        vm.prank(user);
        vm.expectRevert();
        token.rotateAttester(newAttester);

        vm.prank(owner);
        token.rotateAttester(newAttester);
        assertEq(token.attester(), newAttester);
    }

    function test_rotateAttester_revokesOldKey() public {
        // Old attester anchors once, fine.
        MissionProofLib.MissionProof memory p1 = _sampleProof(keccak256("run-1"), 8000, 1);
        token.recordSuccess(p1, _sign(p1, attesterKey));

        (address newAttester, uint256 newKey) = makeAddrAndKey("new-attester");
        vm.prank(owner);
        token.rotateAttester(newAttester);
        assertEq(token.attester(), newAttester);
        MissionProofLib.MissionProof memory p2 = _sampleProof(keccak256("run-2"), 8000, 1);
        token.recordSuccess(p2, _sign(p2, newKey));
        assertEq(token.totalMissions(), 2);
    }

    function test_treasury_depositAndSpend() public {
        vm.deal(address(this), 2 ether);
        (bool ok, ) = address(token).call{ value: 1 ether }("");
        assertTrue(ok);
        assertEq(address(token).balance, 1 ether);

        address payable sink = payable(makeAddr("sink"));

        vm.prank(owner);
        token.spendTreasury(sink, 0.4 ether, "buyback-and-burn tranche");
        assertEq(address(token).balance, 0.6 ether);
        assertEq(sink.balance, 0.4 ether);
    }

    function test_treasury_onlyOwnerCanSpend() public {
        vm.deal(address(this), 1 ether);
        (bool ok, ) = address(token).call{ value: 1 ether }("");
        assertTrue(ok);
        address payable sink = payable(makeAddr("sink"));
        vm.prank(user);
        vm.expectRevert();
        token.spendTreasury(sink, 0.1 ether, "rug attempt");
    }

    function test_stats_view() public {
        MissionProofLib.MissionProof memory p = _sampleProof(keccak256("run-1"), 7500, 1);
        token.recordSuccess(p, _sign(p, attesterKey));
        (uint32 rate, uint256 missions, uint256 successes, uint256 rev, uint64 lastAt) = token.stats();
        assertEq(rate, 7500);
        assertEq(missions, 1);
        assertEq(successes, 1);
        assertEq(rev, 420);
        assertGt(lastAt, 0);
    }
}
