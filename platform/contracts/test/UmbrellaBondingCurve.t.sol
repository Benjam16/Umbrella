// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { UmbrellaBondingCurve } from "../src/UmbrellaBondingCurve.sol";

contract MockToken is ERC20 {
    constructor(uint256 supply) ERC20("Mock", "MOCK") {
        _mint(msg.sender, supply);
    }
}

contract UmbrellaBondingCurveTest is Test {
    MockToken internal token;
    UmbrellaBondingCurve internal curve;
    address internal creator = makeAddr("creator");
    address internal hookAddr = makeAddr("hook");
    address payable internal treasury = payable(makeAddr("treasury"));
    address internal router = makeAddr("v4router");
    address internal buyer = makeAddr("buyer");

    uint256 internal constant SUPPLY = 1_000_000e18;
    uint256 internal constant K = 1; // p(s) = s^2 wei-per-token at s in whole units
    uint256 internal constant THRESHOLD = 5 ether;
    uint256 internal constant SEED = 4 ether;
    uint16 internal constant FEE_BPS = 100; // 1%
    uint16 internal constant TREASURY_FEE_BPS = 50; // 0.5%

    function setUp() public {
        token = new MockToken(SUPPLY);
        curve = new UmbrellaBondingCurve(
            address(token),
            creator,
            hookAddr,
            treasury,
            router,
            SUPPLY,
            K,
            THRESHOLD,
            SEED,
            FEE_BPS,
            TREASURY_FEE_BPS
        );
        token.transfer(address(curve), SUPPLY);
        vm.deal(buyer, 100 ether);
    }

    function test_quoteBuy_zeroSupplyHasZeroCost() public view {
        (uint256 net, uint256 gross) = curve.quoteBuy(1e18);
        // first whole token at s=0..1 integrates k * (1^3 - 0) / 3 = 0 (integer div).
        assertEq(net, 0);
        assertEq(gross, 0);
    }

    function test_buy_transfersTokensAndTracksReserve() public {
        uint256 delta = 100e18;
        (, uint256 gross) = curve.quoteBuy(delta);
        assertGt(gross, 0);

        vm.prank(buyer);
        curve.buy{ value: gross }(delta, gross);

        assertEq(token.balanceOf(buyer), delta);
        assertEq(curve.tokensSold(), delta);
        assertGt(curve.ethReserve(), 0);
    }

    function test_buy_refundsOverpayment() public {
        uint256 delta = 100e18;
        (, uint256 gross) = curve.quoteBuy(delta);
        uint256 overpay = gross + 1 ether;

        uint256 beforeBal = buyer.balance;
        vm.prank(buyer);
        curve.buy{ value: overpay }(delta, gross);
        uint256 afterBal = buyer.balance;

        // buyer paid exactly `gross` (ignoring gas since vm test doesn't charge).
        assertEq(beforeBal - afterBal, gross);
    }

    function test_buy_rejectsWhenSlippageExceeded() public {
        uint256 delta = 100e18;
        (, uint256 gross) = curve.quoteBuy(delta);
        vm.prank(buyer);
        vm.expectRevert();
        curve.buy{ value: gross - 1 }(delta, gross);
    }

    function test_sell_refundsEthAndShrinksSupply() public {
        uint256 delta = 500e18;
        (, uint256 gross) = curve.quoteBuy(delta);
        vm.prank(buyer);
        curve.buy{ value: gross }(delta, gross);

        vm.prank(buyer);
        token.approve(address(curve), delta);

        (uint256 netOut, ) = curve.quoteSell(delta);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        curve.sell(delta, netOut);
        uint256 after_ = buyer.balance;

        assertEq(token.balanceOf(buyer), 0);
        assertEq(curve.tokensSold(), 0);
        assertEq(after_ - before, netOut);
    }

    function test_graduate_onlyAfterThreshold() public {
        // Bootstrap reserve directly to cross threshold without arithmetic noise.
        vm.deal(address(this), THRESHOLD);
        (bool ok, ) = address(curve).call{ value: THRESHOLD }("");
        assertTrue(ok);
        assertEq(curve.ethReserve(), THRESHOLD);

        uint256 routerBefore = router.balance;
        uint256 treasuryBefore = treasury.balance;

        curve.graduate();

        assertTrue(curve.graduated());
        assertEq(token.balanceOf(router), SUPPLY);
        assertEq(router.balance - routerBefore, SEED);
        assertEq(treasury.balance - treasuryBefore, THRESHOLD - SEED);
    }

    function test_graduate_revertsIfBelowThreshold() public {
        vm.expectRevert();
        curve.graduate();
    }

    function test_buyAfterGraduationReverts() public {
        vm.deal(address(this), THRESHOLD);
        (bool ok, ) = address(curve).call{ value: THRESHOLD }("");
        assertTrue(ok);
        curve.graduate();

        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert();
        curve.buy{ value: 1 ether }(1e18, 1 ether);
    }
}
