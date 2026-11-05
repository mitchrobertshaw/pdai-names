// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IRegistrarLike} from "./interfaces/IRegistrarLike.sol";
import {ISwapRouterLike} from "./interfaces/ISwapRouterLike.sol";
import {IWPLS} from "./interfaces/IWPLS.sol";

/// @title AnyTokenCheckout
/// @notice Pay for a name with any token, or with native PLS, while the registrar is only ever
///         paid in its own dollar stablecoin.
/// @dev The input is swapped into `PAYMENT_TOKEN` on an allow-listed Uniswap-V2-style router
///      (PulseX). The registrar is paid exactly its price, and whatever is left over goes back
///      to the caller in `PAYMENT_TOKEN`.
///
///      Registration keeps the registrar's protection against front-running:
///        1. The buyer calls `commit(makeCommitment(...))` on the registrar directly.
///        2. After the registrar's minimum commitment age, the buyer calls `registerWithToken`
///           or `registerWithPLS` here with the same details. ENSv2's commitment does not
///           include the caller, so this contract can complete it for the buyer.
///
///      Properties:
///        - No owner, no admin functions, no upgrades, no pause. Everything is set at deployment.
///        - Holds nothing between calls. Amounts are measured as balance changes inside each
///          call, so tokens that charge a transfer tax work, and tokens sent here directly are
///          never paid out to anyone.
///        - The most a buyer can lose to a sandwich attack is the buffer they add to the quote.
contract AnyTokenCheckout is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice A registration, with the same details that were committed on the registrar.
    struct Registration {
        string label; // the name without its ending, e.g. "alice" for alice.pdai
        address owner; // who receives the name
        bytes32 secret; // the secret used in the commitment
        address subregistry; // ENSv2 subregistry for the name, or address(0)
        address resolver; // resolver for the name, or address(0)
        uint64 duration; // seconds
        bytes32 referrer; // referral tag, passed through to the registrar
    }

    /// @notice A renewal.
    struct Renewal {
        string label;
        uint64 duration; // seconds to add
        bytes32 referrer;
    }

    /// @notice How to turn the input into the payment token.
    /// @dev Leave `path` empty, and `router` zero, when paying with the payment token itself.
    struct Swap {
        address router; // an allow-listed Uniswap-V2-style router
        address[] path; // path[0] = input token (WPLS for native PLS), last = PAYMENT_TOKEN
        uint256 amountOutMin; // the least payment token the swap may return
        uint256 deadline; // unix time after which the swap reverts
    }

    /// @notice The registrar this contract pays.
    IRegistrarLike public immutable REGISTRAR;
    /// @notice The token the registrar is paid in, e.g. DAI bridged from Ethereum.
    IERC20 public immutable PAYMENT_TOKEN;
    /// @notice Wrapped PLS, used when paying with native PLS.
    IERC20 public immutable WPLS;

    /// @notice Routers that swaps may use. Set once, in the constructor.
    mapping(address router => bool allowed) public isAllowedRouter;

    /// @notice A router was allowed at deployment.
    event RouterAllowed(address indexed router);

    /// @notice A registration or renewal was paid for through this contract.
    /// @param payer Who called and received the change.
    /// @param tokenIn The token paid with, or address(0) for native PLS.
    /// @param amountIn How much of `tokenIn` the payer sent.
    /// @param price What the registrar was paid, in `PAYMENT_TOKEN`.
    /// @param change What was returned to the payer, in `PAYMENT_TOKEN`.
    /// @param renewal True for a renewal, false for a new registration.
    event Paid(
        address indexed payer, address indexed tokenIn, uint256 amountIn, uint256 price, uint256 change, bool renewal
    );

    /// @notice A constructor argument was the zero address.
    error ZeroAddress();
    /// @notice `router` is not on the allow-list.
    error RouterNotAllowed(address router);
    /// @notice The swap path does not run from the input token to the payment token.
    error InvalidPath();
    /// @notice `registerWithPLS` or `renewWithPLS` was called without any PLS.
    error NoValue();
    /// @notice The swap returned less than the registrar's price.
    error InsufficientPayment(uint256 received, uint256 price);

    /// @param registrar The registrar to pay.
    /// @param paymentToken The token the registrar accepts, e.g. DAI bridged from Ethereum.
    /// @param wpls Wrapped PLS.
    /// @param routers Uniswap-V2-style routers to allow, e.g. PulseX V1 and V2. Fixed for good.
    constructor(IRegistrarLike registrar, IERC20 paymentToken, IERC20 wpls, address[] memory routers) {
        if (address(registrar) == address(0) || address(paymentToken) == address(0) || address(wpls) == address(0))
        {
            revert ZeroAddress();
        }
        REGISTRAR = registrar;
        PAYMENT_TOKEN = paymentToken;
        WPLS = wpls;
        for (uint256 i = 0; i < routers.length; ++i) {
            if (routers[i] == address(0)) revert ZeroAddress();
            isAllowedRouter[routers[i]] = true;
            emit RouterAllowed(routers[i]);
        }
    }

    // ------------------------------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------------------------------

    /// @notice Registers a name, paying with `amountIn` of `tokenIn`.
    /// @dev The caller must have approved this contract for `amountIn` of `tokenIn`, and must
    ///      have committed `reg` on the registrar beforehand. Quote with `quoteRegister`, then add
    ///      a buffer for price movement and for any transfer tax the token charges.
    /// @return tokenId The registrar's id for the name.
    /// @return change Payment token returned to the caller.
    function registerWithToken(Registration calldata reg, IERC20 tokenIn, uint256 amountIn, Swap calldata swap)
        external
        nonReentrant
        returns (uint256 tokenId, uint256 change)
    {
        _validateRoute(address(tokenIn), swap.router, swap.path);
        uint256 got = _toPaymentToken(tokenIn, _pull(tokenIn, amountIn), swap);
        uint256 paid;
        (tokenId, paid, change) = _payRegistration(reg, got);
        emit Paid(msg.sender, address(tokenIn), amountIn, paid, change, false);
    }

    /// @notice Registers a name, paying with the PLS sent along with the call.
    /// @dev `swap.path` must start with WPLS. Change comes back in the payment token, not PLS.
    function registerWithPLS(Registration calldata reg, Swap calldata swap)
        external
        payable
        nonReentrant
        returns (uint256 tokenId, uint256 change)
    {
        _validateRoute(address(WPLS), swap.router, swap.path);
        uint256 got = _toPaymentToken(WPLS, _wrap(), swap);
        uint256 paid;
        (tokenId, paid, change) = _payRegistration(reg, got);
        emit Paid(msg.sender, address(0), msg.value, paid, change, false);
    }

    // ------------------------------------------------------------------------------------------
    // Renewal
    // ------------------------------------------------------------------------------------------

    /// @notice Renews a name, paying with `amountIn` of `tokenIn`.
    /// @dev Anyone can renew any name. The caller must have approved this contract for `amountIn`.
    /// @return change Payment token returned to the caller.
    function renewWithToken(Renewal calldata ren, IERC20 tokenIn, uint256 amountIn, Swap calldata swap)
        external
        nonReentrant
        returns (uint256 change)
    {
        _validateRoute(address(tokenIn), swap.router, swap.path);
        uint256 got = _toPaymentToken(tokenIn, _pull(tokenIn, amountIn), swap);
        uint256 paid;
        (paid, change) = _payRenewal(ren, got);
        emit Paid(msg.sender, address(tokenIn), amountIn, paid, change, true);
    }

    /// @notice Renews a name, paying with the PLS sent along with the call.
    function renewWithPLS(Renewal calldata ren, Swap calldata swap)
        external
        payable
        nonReentrant
        returns (uint256 change)
    {
        _validateRoute(address(WPLS), swap.router, swap.path);
        uint256 got = _toPaymentToken(WPLS, _wrap(), swap);
        uint256 paid;
        (paid, change) = _payRenewal(ren, got);
        emit Paid(msg.sender, address(0), msg.value, paid, change, true);
    }

    // ------------------------------------------------------------------------------------------
    // Quotes, for websites
    // ------------------------------------------------------------------------------------------

    /// @notice The registrar's price for a registration, and roughly how much of `path[0]` buys it.
    /// @dev `amountIn` ignores transfer taxes and price movement; add a buffer before paying.
    ///      With an empty `path`, `amountIn` is the price in the payment token itself.
    function quoteRegister(string calldata label, uint64 duration, address router, address[] calldata path)
        external
        view
        returns (uint256 price, uint256 amountIn)
    {
        price = _registerPrice(label, duration);
        amountIn = _quoteIn(price, router, path);
    }

    /// @notice The registrar's price for a renewal, and roughly how much of `path[0]` buys it.
    function quoteRenew(string calldata label, uint64 duration, address router, address[] calldata path)
        external
        view
        returns (uint256 price, uint256 amountIn)
    {
        price = REGISTRAR.getRenewPrice(label, duration, PAYMENT_TOKEN);
        amountIn = _quoteIn(price, router, path);
    }

    // ------------------------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------------------------

    /// @dev Checks the route before any tokens move.
    function _validateRoute(address tokenIn, address router, address[] calldata path) private view {
        uint256 n = path.length;
        if (tokenIn == address(PAYMENT_TOKEN)) {
            if (n != 0) revert InvalidPath();
            return;
        }
        if (!isAllowedRouter[router]) revert RouterNotAllowed(router);
        if (n < 2 || path[0] != tokenIn || path[n - 1] != address(PAYMENT_TOKEN)) revert InvalidPath();
    }

    /// @dev Pulls `amount` of `token` from the caller and returns what actually arrived.
    function _pull(IERC20 token, uint256 amount) private returns (uint256 received) {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - before;
    }

    /// @dev Wraps the PLS sent with the call and returns the WPLS received.
    function _wrap() private returns (uint256 received) {
        if (msg.value == 0) revert NoValue();
        uint256 before = WPLS.balanceOf(address(this));
        IWPLS(address(WPLS)).deposit{value: msg.value}();
        received = WPLS.balanceOf(address(this)) - before;
    }

    /// @dev Swaps `amount` of `tokenIn` into the payment token. Assumes the route is valid.
    function _toPaymentToken(IERC20 tokenIn, uint256 amount, Swap calldata swap) private returns (uint256 got) {
        if (address(tokenIn) == address(PAYMENT_TOKEN)) return amount;
        uint256 before = PAYMENT_TOKEN.balanceOf(address(this));
        tokenIn.forceApprove(swap.router, amount);
        ISwapRouterLike(swap.router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amount, swap.amountOutMin, swap.path, address(this), swap.deadline
        );
        tokenIn.forceApprove(swap.router, 0);
        got = PAYMENT_TOKEN.balanceOf(address(this)) - before;
    }

    /// @dev Pays the registrar for `reg` out of `got` and returns the rest to the caller.
    function _payRegistration(Registration calldata reg, uint256 got)
        private
        returns (uint256 tokenId, uint256 paid, uint256 change)
    {
        uint256 price = _registerPrice(reg.label, reg.duration);
        if (got < price) revert InsufficientPayment(got, price);
        uint256 before = PAYMENT_TOKEN.balanceOf(address(this));
        PAYMENT_TOKEN.forceApprove(address(REGISTRAR), price);
        tokenId = _callRegister(reg);
        PAYMENT_TOKEN.forceApprove(address(REGISTRAR), 0);
        paid = before - PAYMENT_TOKEN.balanceOf(address(this));
        change = _refund(got - paid);
    }

    /// @dev Pays the registrar for `ren` out of `got` and returns the rest to the caller.
    function _payRenewal(Renewal calldata ren, uint256 got) private returns (uint256 paid, uint256 change) {
        uint256 price = REGISTRAR.getRenewPrice(ren.label, ren.duration, PAYMENT_TOKEN);
        if (got < price) revert InsufficientPayment(got, price);
        uint256 before = PAYMENT_TOKEN.balanceOf(address(this));
        PAYMENT_TOKEN.forceApprove(address(REGISTRAR), price);
        REGISTRAR.renew(ren.label, ren.duration, PAYMENT_TOKEN, ren.referrer);
        PAYMENT_TOKEN.forceApprove(address(REGISTRAR), 0);
        paid = before - PAYMENT_TOKEN.balanceOf(address(this));
        change = _refund(got - paid);
    }

    function _callRegister(Registration calldata reg) private returns (uint256) {
        return REGISTRAR.register(
            reg.label, reg.owner, reg.secret, reg.subregistry, reg.resolver, reg.duration, PAYMENT_TOKEN, reg.referrer
        );
    }

    function _registerPrice(string calldata label, uint64 duration) private view returns (uint256) {
        (uint256 base, uint256 premium) = REGISTRAR.getRegisterPrice(label, duration, PAYMENT_TOKEN);
        return base + premium;
    }

    function _quoteIn(uint256 price, address router, address[] calldata path) private view returns (uint256) {
        if (path.length == 0) return price;
        _validateRoute(path[0], router, path);
        return ISwapRouterLike(router).getAmountsIn(price, path)[0];
    }

    function _refund(uint256 amount) private returns (uint256) {
        if (amount != 0) PAYMENT_TOKEN.safeTransfer(msg.sender, amount);
        return amount;
    }
}
