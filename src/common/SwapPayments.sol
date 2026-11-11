// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISwapRouterLike} from "../interfaces/ISwapRouterLike.sol";
import {IWrappedNative} from "../interfaces/IWrappedNative.sol";
import {ZeroAddress} from "./Errors.sol";

/// @title SwapPayments
/// @notice Takes payment in any token with a pool, or in the chain's native coin, and turns it into
///         one stablecoin. Shared by `AnyTokenCheckout` on PulseChain and `HexOrderBook` on Ethereum.
/// @dev Every amount is measured as a balance change, so tokens that charge a transfer tax work,
///      and tokens sent to the contract directly are never counted towards anyone's payment.
///      Swaps only use routers fixed at deployment.
abstract contract SwapPayments {
    using SafeERC20 for IERC20;

    /// @notice How to turn the input into `PAYMENT_TOKEN`.
    /// @dev Leave `path` empty, and `router` zero, when paying with `PAYMENT_TOKEN` itself.
    struct Swap {
        address router; // an allow-listed Uniswap-V2-style router
        address[] path; // path[0] = input token (the wrapped coin for native payments), last = PAYMENT_TOKEN
        uint256 amountOutMin; // the least PAYMENT_TOKEN the swap may return
        uint256 deadline; // unix time after which the swap reverts
    }

    /// @notice The stablecoin every payment is turned into.
    IERC20 public immutable PAYMENT_TOKEN;

    /// @notice The chain's wrapped native coin (WPLS or WETH), used for native payments.
    IERC20 public immutable WRAPPED_NATIVE;

    /// @notice Routers that swaps may use. Set once, in the constructor.
    mapping(address router => bool allowed) public isAllowedRouter;

    /// @notice A router was allowed at deployment.
    event RouterAllowed(address indexed router);

    /// @notice `router` is not on the allow-list.
    error RouterNotAllowed(address router);
    /// @notice The swap path does not run from the input token to `PAYMENT_TOKEN`.
    error InvalidPath();
    /// @notice A native-coin payment was called without any coins.
    error NoValue();
    /// @notice The payment came to less than was needed.
    error InsufficientPayment(uint256 received, uint256 needed);

    constructor(IERC20 paymentToken, IERC20 wrappedNative, address[] memory routers) {
        if (address(paymentToken) == address(0) || address(wrappedNative) == address(0)) revert ZeroAddress();
        PAYMENT_TOKEN = paymentToken;
        WRAPPED_NATIVE = wrappedNative;
        for (uint256 i = 0; i < routers.length; ++i) {
            if (routers[i] == address(0)) revert ZeroAddress();
            isAllowedRouter[routers[i]] = true;
            emit RouterAllowed(routers[i]);
        }
    }

    /// @dev Checks the route before any tokens move.
    function _validateRoute(address tokenIn, address router, address[] calldata path) internal view {
        uint256 n = path.length;
        if (tokenIn == address(PAYMENT_TOKEN)) {
            if (n != 0) revert InvalidPath();
            return;
        }
        if (!isAllowedRouter[router]) revert RouterNotAllowed(router);
        if (n < 2 || path[0] != tokenIn || path[n - 1] != address(PAYMENT_TOKEN)) revert InvalidPath();
    }

    /// @dev Pulls `amount` of `token` from the caller and returns what actually arrived.
    function _pull(IERC20 token, uint256 amount) internal returns (uint256 received) {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - before;
    }

    /// @dev Wraps the coins sent with the call and returns the wrapped amount received.
    function _wrap() internal returns (uint256 received) {
        if (msg.value == 0) revert NoValue();
        uint256 before = WRAPPED_NATIVE.balanceOf(address(this));
        IWrappedNative(address(WRAPPED_NATIVE)).deposit{value: msg.value}();
        received = WRAPPED_NATIVE.balanceOf(address(this)) - before;
    }

    /// @dev Swaps `amount` of `tokenIn` into `PAYMENT_TOKEN` and returns what arrived.
    ///      Assumes `_validateRoute` passed.
    function _toPaymentToken(IERC20 tokenIn, uint256 amount, Swap calldata swap) internal returns (uint256 got) {
        if (address(tokenIn) == address(PAYMENT_TOKEN)) return amount;
        uint256 before = PAYMENT_TOKEN.balanceOf(address(this));
        tokenIn.forceApprove(swap.router, amount);
        ISwapRouterLike(swap.router)
            .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amount, swap.amountOutMin, swap.path, address(this), swap.deadline
            );
        tokenIn.forceApprove(swap.router, 0);
        got = PAYMENT_TOKEN.balanceOf(address(this)) - before;
    }

    /// @dev Roughly how much of `path[0]` buys `amountOut` of `PAYMENT_TOKEN`. Ignores transfer taxes.
    function _quoteIn(uint256 amountOut, address router, address[] calldata path) internal view returns (uint256) {
        if (path.length == 0) return amountOut;
        _validateRoute(path[0], router, path);
        return ISwapRouterLike(router).getAmountsIn(amountOut, path)[0];
    }

    /// @dev Sends `amount` of `PAYMENT_TOKEN` back to the caller.
    function _refund(uint256 amount) internal returns (uint256) {
        if (amount != 0) PAYMENT_TOKEN.safeTransfer(msg.sender, amount);
        return amount;
    }
}
