// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  UmbrellaBondingCurve
 * @notice Pump.fun-style bonding curve for a single Umbrella agent token.
 *
 * Lifecycle:
 *   1. Factory deploys the curve with the token's full supply already
 *      transferred in and immutable `tokenSupply`, `k`, `graduationThresholdWei`,
 *      `creator`, `hookAddress`, `treasury` set.
 *   2. Anyone calls `buy{value}(minTokensOut)` / `sell(tokensIn, minEthOut)`.
 *      Price is `p(s) = k * s^2` where `s = tokensSold / 1e18`.
 *      Integral gives cost: `cost(s1,s2) = k * (s2^3 - s1^3) / 3`.
 *   3. Once `ethReserve >= graduationThresholdWei`, any caller may invoke
 *      `graduate()`. The curve stops accepting trades, transfers the
 *      remaining token balance + `graduationSeedWei` ETH to `router`, and
 *      emits `Graduated(token, hook, router)`. The off-chain worker then
 *      deploys the full-range v4 position via the router.
 *
 * Design choices:
 *   - All ETH settlement is in wei; we keep math in plain uint256 and guard
 *     against overflow by capping `tokensSold` at `tokensAvailable`.
 *   - Curve fees: `swapFeeBps` on every buy/sell is split between `treasury`
 *     and retained in the curve's ETH reserve (which is what seeds the v4
 *     pool). Defaults: 1% total, half to treasury.
 *   - `graduationSeedWei <= ethReserve` guaranteed; any residual ETH after
 *     graduation is swept to treasury so the contract self-terminates cleanly.
 *   - No owner. Once deployed the curve is immutable and permissionless.
 */
contract UmbrellaBondingCurve {
    using SafeERC20 for IERC20;

    // --- immutables --------------------------------------------------------

    /// @notice `UmbrellaCurveFactory` address (msg.sender at deploy). Used to
    ///         route first buy to the listed creator atomically at curve creation.
    address public immutable factory;

    IERC20 public immutable token;
    address public immutable creator;
    address public immutable hookAddress;
    address payable public immutable treasury;
    address public immutable router;

    /// @notice Total tokens seeded into this curve (transferred in at deploy).
    uint256 public immutable tokensAvailable;

    /// @notice Curve coefficient k scaled by 1e18 so price(s) in wei is
    ///         `k * s^2 / 1e18^2` where s = tokensSold / 1e18.
    uint256 public immutable k;

    /// @notice ETH reserve required before `graduate()` is callable.
    uint256 public immutable graduationThresholdWei;

    /// @notice ETH sent into the router when graduation occurs. Must be <=
    ///         `graduationThresholdWei`. The residual goes to treasury.
    uint256 public immutable graduationSeedWei;

    /// @notice Buy/sell fee in basis points. 100 = 1%.
    uint16 public immutable swapFeeBps;

    /// @notice Portion of `swapFeeBps` routed to treasury. The rest stays in
    ///         `ethReserve` and seeds the eventual pool.
    uint16 public immutable treasuryFeeBps;

    // --- state -------------------------------------------------------------

    /// @notice Tokens sold into the market via `buy`. Decreases on `sell`.
    uint256 public tokensSold;

    /// @notice ETH held by this curve that will seed the v4 pool at graduation.
    uint256 public ethReserve;

    /// @notice Flipped on `graduate()`. Once true, buy/sell revert.
    bool public graduated;

    // --- events ------------------------------------------------------------

    event Buy(
        address indexed buyer,
        uint256 ethIn,
        uint256 tokensOut,
        uint256 tokensSoldAfter,
        uint256 ethReserveAfter
    );
    event Sell(
        address indexed seller,
        uint256 tokensIn,
        uint256 ethOut,
        uint256 tokensSoldAfter,
        uint256 ethReserveAfter
    );
    event Graduated(
        address indexed token,
        address indexed hook,
        address indexed router,
        uint256 tokensSent,
        uint256 ethSent
    );
    event TreasuryFeeSent(address indexed treasury, uint256 amountWei);

    // --- errors ------------------------------------------------------------

    error AlreadyGraduated();
    error NotReadyToGraduate(uint256 reserve, uint256 threshold);
    error SlippageExceeded(uint256 got, uint256 min);
    error ZeroTrade();
    error InsufficientCurveEth(uint256 have, uint256 need);
    error TooManyTokens(uint256 requested, uint256 available);
    error OnlyFactory();

    constructor(
        address token_,
        address creator_,
        address hookAddress_,
        address payable treasury_,
        address router_,
        uint256 tokensAvailable_,
        uint256 k_,
        uint256 graduationThresholdWei_,
        uint256 graduationSeedWei_,
        uint16 swapFeeBps_,
        uint16 treasuryFeeBps_
    ) {
        require(token_ != address(0), "token=0");
        require(creator_ != address(0), "creator=0");
        require(treasury_ != address(0), "treasury=0");
        require(router_ != address(0), "router=0");
        require(tokensAvailable_ > 0, "supply=0");
        require(k_ > 0, "k=0");
        require(graduationSeedWei_ <= graduationThresholdWei_, "seed>threshold");
        require(swapFeeBps_ <= 1_000, "fee>10%");
        require(treasuryFeeBps_ <= swapFeeBps_, "treasuryFee>totalFee");

        factory = msg.sender;
        token = IERC20(token_);
        creator = creator_;
        hookAddress = hookAddress_;
        treasury = treasury_;
        router = router_;
        tokensAvailable = tokensAvailable_;
        k = k_;
        graduationThresholdWei = graduationThresholdWei_;
        graduationSeedWei = graduationSeedWei_;
        swapFeeBps = swapFeeBps_;
        treasuryFeeBps = treasuryFeeBps_;
    }

    // --- views -------------------------------------------------------------

    /// @notice Current marginal price per token (wei per 1e18 tokens).
    function spotPriceWei() external view returns (uint256) {
        uint256 s = tokensSold / 1e18;
        return (k * s * s) / 1e18;
    }

    /// @notice Cost (in wei, pre-fee) to move supply from tokensSold to
    ///         tokensSold + deltaTokens.
    function quoteBuy(uint256 deltaTokens) public view returns (uint256 ethInNet, uint256 ethInGross) {
        if (deltaTokens == 0) return (0, 0);
        uint256 newSold = tokensSold + deltaTokens;
        if (newSold > tokensAvailable) revert TooManyTokens(deltaTokens, tokensAvailable - tokensSold);
        uint256 cost = _areaBetween(tokensSold, newSold);
        uint256 fee = (cost * swapFeeBps) / 10_000;
        ethInNet = cost;
        ethInGross = cost + fee;
    }

    /// @notice ETH returned (net of fees) for selling deltaTokens.
    function quoteSell(uint256 deltaTokens) public view returns (uint256 ethOutNet, uint256 ethOutGross) {
        if (deltaTokens == 0) return (0, 0);
        if (deltaTokens > tokensSold) revert TooManyTokens(deltaTokens, tokensSold);
        uint256 newSold = tokensSold - deltaTokens;
        uint256 refund = _areaBetween(newSold, tokensSold);
        uint256 fee = (refund * swapFeeBps) / 10_000;
        ethOutGross = refund;
        ethOutNet = refund - fee;
    }

    /// @notice Tokens delivered for exactly `ethInGross` wei (fee inclusive).
    ///         Solves `ethInGross * (1 - fee) = k * ((s0 + ds)^3 - s0^3) / 3`.
    ///         Uses a linear-secant refinement bounded to 32 iterations — good
    ///         enough for the UI quote; the actual trade uses the integral form
    ///         in `buy`.
    function previewBuyFromEth(uint256 ethInGross) external view returns (uint256 tokensOut) {
        if (ethInGross == 0) return 0;
        uint256 feeNum = uint256(swapFeeBps);
        uint256 ethNet = (ethInGross * 10_000) / (10_000 + feeNum);
        uint256 remaining = tokensAvailable - tokensSold;
        uint256 lo = 0;
        uint256 hi = remaining;
        for (uint256 i = 0; i < 32; i++) {
            uint256 mid = (lo + hi) / 2;
            if (mid == 0) { lo = 1; continue; }
            uint256 cost = _areaBetween(tokensSold, tokensSold + mid);
            if (cost > ethNet) hi = mid;
            else lo = mid;
            if (hi - lo <= 1) break;
        }
        return lo;
    }

    // --- trading -----------------------------------------------------------

    /// @notice Buy tokens from the curve. `msg.value` is the fee-inclusive
    ///         ETH amount; any overpayment beyond what `tokensOut` costs is
    ///         refunded to the caller.
    function buy(uint256 tokensOut, uint256 maxEthIn) external payable returns (uint256 ethSpent) {
        if (graduated) revert AlreadyGraduated();
        if (tokensOut == 0) revert ZeroTrade();
        (uint256 ethNet, uint256 ethGross) = quoteBuy(tokensOut);
        if (ethGross > maxEthIn) revert SlippageExceeded(ethGross, maxEthIn);
        if (msg.value < ethGross) revert SlippageExceeded(msg.value, ethGross);

        tokensSold += tokensOut;
        uint256 treasuryCut = (ethNet * treasuryFeeBps) / 10_000;
        ethReserve += (ethGross - treasuryCut);

        token.safeTransfer(msg.sender, tokensOut);

        if (treasuryCut > 0) {
            (bool ok, ) = treasury.call{ value: treasuryCut }("");
            require(ok, "treasury send failed");
            emit TreasuryFeeSent(treasury, treasuryCut);
        }

        uint256 refund = msg.value - ethGross;
        if (refund > 0) {
            (bool ok2, ) = msg.sender.call{ value: refund }("");
            require(ok2, "refund failed");
        }

        emit Buy(msg.sender, ethGross, tokensOut, tokensSold, ethReserve);
        return ethGross;
    }

    /// @notice Same as `buy` but delivers tokens to `recipient`. Only the
    ///         deploying `UmbrellaCurveFactory` may call (creator snipe at launch).
    function buyTo(address recipient, uint256 tokensOut, uint256 maxEthIn) external payable returns (uint256 ethGross) {
        if (msg.sender != factory) revert OnlyFactory();
        if (graduated) revert AlreadyGraduated();
        if (tokensOut == 0) revert ZeroTrade();
        (uint256 ethNet, uint256 ethGross_) = quoteBuy(tokensOut);
        if (ethGross_ > maxEthIn) revert SlippageExceeded(ethGross_, maxEthIn);
        if (msg.value < ethGross_) revert SlippageExceeded(msg.value, ethGross_);

        tokensSold += tokensOut;
        uint256 treasuryCut = (ethNet * treasuryFeeBps) / 10_000;
        ethReserve += (ethGross_ - treasuryCut);

        token.safeTransfer(recipient, tokensOut);

        if (treasuryCut > 0) {
            (bool ok, ) = treasury.call{ value: treasuryCut }("");
            require(ok, "treasury send failed");
            emit TreasuryFeeSent(treasury, treasuryCut);
        }

        uint256 refund = msg.value - ethGross_;
        if (refund > 0) {
            (bool ok2, ) = msg.sender.call{ value: refund }("");
            require(ok2, "refund failed");
        }

        emit Buy(recipient, ethGross_, tokensOut, tokensSold, ethReserve);
        return ethGross_;
    }

    /// @notice Sell tokens back to the curve. Caller must have approved the
    ///         curve to pull `tokensIn`.
    function sell(uint256 tokensIn, uint256 minEthOut) external returns (uint256 ethOut) {
        if (graduated) revert AlreadyGraduated();
        if (tokensIn == 0) revert ZeroTrade();
        (uint256 ethNet, uint256 ethGross) = quoteSell(tokensIn);
        if (ethNet < minEthOut) revert SlippageExceeded(ethNet, minEthOut);
        if (ethReserve < ethGross) revert InsufficientCurveEth(ethReserve, ethGross);

        tokensSold -= tokensIn;
        uint256 treasuryCut = ((ethGross - ethNet) * treasuryFeeBps) / swapFeeBps;
        ethReserve -= ethGross;

        token.safeTransferFrom(msg.sender, address(this), tokensIn);

        (bool ok, ) = msg.sender.call{ value: ethNet }("");
        require(ok, "refund failed");
        if (treasuryCut > 0) {
            (bool ok2, ) = treasury.call{ value: treasuryCut }("");
            require(ok2, "treasury send failed");
            emit TreasuryFeeSent(treasury, treasuryCut);
        }

        emit Sell(msg.sender, tokensIn, ethNet, tokensSold, ethReserve);
        return ethNet;
    }

    // --- graduation --------------------------------------------------------

    /// @notice Permissionless once `ethReserve >= graduationThresholdWei`.
    ///         Seeds the v4 router with remaining tokens + ETH. The off-chain
    ///         worker consumes the `Graduated` event and performs the v4
    ///         `initialize` + `modifyLiquidity` calls against the router.
    function graduate() external returns (uint256 tokensSent, uint256 ethSent) {
        if (graduated) revert AlreadyGraduated();
        if (ethReserve < graduationThresholdWei) {
            revert NotReadyToGraduate(ethReserve, graduationThresholdWei);
        }
        graduated = true;

        tokensSent = token.balanceOf(address(this));
        ethSent = graduationSeedWei;
        uint256 residual = ethReserve - ethSent;
        ethReserve = 0;

        if (tokensSent > 0) {
            token.safeTransfer(router, tokensSent);
        }
        if (ethSent > 0) {
            (bool ok, ) = router.call{ value: ethSent }("");
            require(ok, "router send failed");
        }
        if (residual > 0) {
            (bool ok2, ) = treasury.call{ value: residual }("");
            require(ok2, "residual send failed");
            emit TreasuryFeeSent(treasury, residual);
        }
        emit Graduated(address(token), hookAddress, router, tokensSent, ethSent);
    }

    // --- internals ---------------------------------------------------------

    /// @dev Integral of `k * s^2` from s0 to s1 where s is tokens / 1e18.
    ///      Result in wei. Keeps math in uint256 and guards against the cubic
    ///      overflow by operating on scaled units.
    function _areaBetween(uint256 t0, uint256 t1) internal view returns (uint256) {
        // Scale tokens down by 1e18 so s^3 stays in a reasonable range; then
        // divide by 3 and by 1e18 once more because k is already 1e18-scaled.
        uint256 s0 = t0 / 1e18;
        uint256 s1 = t1 / 1e18;
        // (s1^3 - s0^3) / 3
        uint256 cube1 = s1 * s1 * s1;
        uint256 cube0 = s0 * s0 * s0;
        uint256 diff = cube1 - cube0;
        return (k * diff) / 3;
    }

    receive() external payable {
        // Accept direct ETH only before graduation so the reserve stays honest.
        if (graduated) revert AlreadyGraduated();
        ethReserve += msg.value;
    }
}
