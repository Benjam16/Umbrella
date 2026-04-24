// SPDX-License-Identifier: MIT
pragma solidity >=0.4.16 >=0.6.2 ^0.8.20 ^0.8.26;

// lib/openzeppelin-contracts/contracts/utils/introspection/IERC165.sol

// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/interfaces/IERC165.sol

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC165.sol)

// lib/openzeppelin-contracts/contracts/interfaces/IERC20.sol

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC20.sol)

// lib/openzeppelin-contracts/contracts/interfaces/IERC1363.sol

// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol

// OpenZeppelin Contracts (last updated v5.5.0) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!_safeTransfer(token, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        if (!_safeTransferFrom(token, from, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _safeTransfer(token, to, value, false);
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _safeTransferFrom(token, from, to, value, false);
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        if (!_safeApprove(token, spender, value, false)) {
            if (!_safeApprove(token, spender, 0, true)) revert SafeERC20FailedOperation(address(token));
            if (!_safeApprove(token, spender, value, true)) revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Oppositely, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity `token.transfer(to, value)` call, relaxing the requirement on the return value: the
     * return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransfer(IERC20 token, address to, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.transfer.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(to, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }

    /**
     * @dev Imitates a Solidity `token.transferFrom(from, to, value)` call, relaxing the requirement on the return
     * value: the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param from The sender of the tokens
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 value,
        bool bubble
    ) private returns (bool success) {
        bytes4 selector = IERC20.transferFrom.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(from, shr(96, not(0))))
            mstore(0x24, and(to, shr(96, not(0))))
            mstore(0x44, value)
            success := call(gas(), token, 0, 0x00, 0x64, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
            mstore(0x60, 0)
        }
    }

    /**
     * @dev Imitates a Solidity `token.approve(spender, value)` call, relaxing the requirement on the return value:
     * the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param spender The spender of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeApprove(IERC20 token, address spender, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.approve.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(spender, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }
}

// src/UmbrellaBondingCurve.sol

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
