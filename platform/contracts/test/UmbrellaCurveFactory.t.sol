// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { UmbrellaCurveFactory } from "../src/UmbrellaCurveFactory.sol";
import { UmbrellaBondingCurve } from "../src/UmbrellaBondingCurve.sol";

contract PermitToken is ERC20Permit {
    constructor(address recipient, uint256 supply) ERC20("Permit", "PMT") ERC20Permit("Permit") {
        _mint(recipient, supply);
    }
}

contract UmbrellaCurveFactoryTest is Test {
    UmbrellaCurveFactory internal factory;
    address internal owner = makeAddr("owner");
    address payable internal treasury = payable(makeAddr("treasury"));
    address internal v4router = makeAddr("v4router");
    address internal creator;
    uint256 internal creatorKey;
    address internal hookAddr = makeAddr("hook");

    uint256 internal constant SUPPLY = 1_000_000e18;
    uint256 internal constant K = 1;
    uint256 internal constant THRESHOLD = 5 ether;
    uint256 internal constant SEED = 4 ether;

    function setUp() public {
        (creator, creatorKey) = makeAddrAndKey("creator");
        factory = new UmbrellaCurveFactory(
            owner, treasury, v4router, K, THRESHOLD, SEED, 100, 50
        );
    }

    function test_createCurve_pullsSupplyFromCreator() public {
        PermitToken token = new PermitToken(creator, SUPPLY);
        vm.prank(creator);
        token.approve(address(factory), SUPPLY);

        vm.prank(creator);
        address curveAddr = factory.createCurve(address(token), creator, hookAddr, SUPPLY);
        assertTrue(curveAddr != address(0));
        assertEq(token.balanceOf(curveAddr), SUPPLY);
        assertEq(factory.curveFor(address(token)), curveAddr);

        UmbrellaBondingCurve curve = UmbrellaBondingCurve(payable(curveAddr));
        assertEq(curve.creator(), creator);
        assertEq(curve.hookAddress(), hookAddr);
        assertEq(curve.tokensAvailable(), SUPPLY);
    }

    function test_createCurveWithPermit_relayedByThirdParty() public {
        PermitToken token = new PermitToken(creator, SUPPLY);
        address relayer = makeAddr("relayer");

        uint256 nonce = token.nonces(creator);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 permitHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                creator,
                address(factory),
                SUPPLY,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), permitHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(creatorKey, digest);

        vm.prank(relayer);
        address curveAddr = factory.createCurveWithPermit(
            address(token), creator, hookAddr, SUPPLY, deadline, v, r, s
        );
        assertEq(token.balanceOf(curveAddr), SUPPLY);
        assertEq(factory.curveFor(address(token)), curveAddr);
    }

    function test_createCurve_rejectsDuplicate() public {
        PermitToken token = new PermitToken(creator, SUPPLY);
        vm.prank(creator);
        token.approve(address(factory), SUPPLY);

        vm.prank(creator);
        factory.createCurve(address(token), creator, hookAddr, SUPPLY / 2);

        vm.prank(creator);
        vm.expectRevert();
        factory.createCurve(address(token), creator, hookAddr, SUPPLY / 4);
    }

    function test_setCurveConfig_ownerOnly() public {
        vm.expectRevert();
        factory.setCurveConfig(K, THRESHOLD, SEED, 100, 50);

        vm.prank(owner);
        factory.setCurveConfig(K * 2, THRESHOLD * 2, SEED * 2, 200, 100);
        assertEq(factory.curveK(), K * 2);
        assertEq(factory.graduationThresholdWei(), THRESHOLD * 2);
    }

    function test_setTreasury_ownerOnly() public {
        address payable newTreasury = payable(makeAddr("newTreasury"));
        vm.expectRevert();
        factory.setTreasury(newTreasury);

        vm.prank(owner);
        factory.setTreasury(newTreasury);
        assertEq(factory.treasury(), newTreasury);
    }
}
