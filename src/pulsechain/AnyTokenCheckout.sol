// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IETHRegistrar} from "@ensv2/registrar/interfaces/IETHRegistrar.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";

import {ZeroAddress} from "../common/Errors.sol";
import {SwapPayments} from "../common/SwapPayments.sol";
import {IHexMirrorSync} from "../interfaces/IHexBridge.sol";

/// @title AnyTokenCheckout
/// @notice Buy or renew a .hex name on PulseChain with any token, or with PLS, while the registrar
///         is only ever paid in its own dollar stablecoin.
/// @dev The same design as the .pdai checkout. The input is swapped into `PAYMENT_TOKEN` on PulseX,
///      the registrar is paid exactly its price, and whatever is left goes back to the caller.
///
///      Registration keeps the registrar's protection against front-running:
///        1. The buyer calls `commit(makeCommitment(...))` on the registrar directly.
///        2. After the registrar's minimum commitment age, the buyer calls `registerWithToken` or
///           `registerWithPLS` here with the same details. ENSv2's commitment does not include the
///           caller, so this contract can complete it for the buyer.
///
///      After a registration or renewal, the name is sent to the Ethereum copy through
///      `MIRROR_SYNC` (best effort; it never blocks a purchase).
///
///      The copy fee. Each copy is written on Ethereum by whoever claims its bridge message there,
///      the project's bot, which pays Ethereum's gas. When Ethereum is busy, the bot sets a copy fee
///      here: the part of a copy's cost the project doesn't cover. Buyers who want their name copied
///      at once add it to their payment through the `...AndCopy` functions, up to a limit they set;
///      `payCopyFee` pays it on its own (after sending a name to another wallet, say). Nobody pays it
///      unless they choose to, and buyers who don't are served exactly as before. The fee goes to the
///      bot, with the bridge message of the copy it paid for (`CopyPaid`), so the bot copies those
///      names first. The owner (the project's admin) chooses the bot and caps the fee; neither can
///      touch names, prices or what the registrar is paid.
///
///      No upgrades. Holds nothing between calls.
contract AnyTokenCheckout is SwapPayments, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @notice A registration, with the same details that were committed on the registrar.
    struct Registration {
        string label; // the name without .hex, e.g. "alice" for alice.hex
        address owner; // who receives the name
        bytes32 secret; // the secret used in the commitment
        IRegistry subregistry; // ENSv2 subregistry for the name, or zero
        address resolver; // resolver for the name, or zero to resolve to the owner
        uint64 duration; // seconds
        bytes32 referrer; // referral tag, passed through to the registrar
    }

    /// @notice A renewal.
    struct Renewal {
        string label;
        uint64 duration; // seconds to add
        bytes32 referrer;
    }

    /// @notice The .hex registrar.
    IETHRegistrar public immutable REGISTRAR;

    /// @notice Copies names to Ethereum after a purchase, or zero to skip that.
    IHexMirrorSync public immutable MIRROR_SYNC;

    /// @notice The bot that copies names to Ethereum: it sets the copy fee and receives it. Zero
    ///         switches the fee off.
    address public copyBot;

    /// @notice The most anyone can be charged for a copy, in `PAYMENT_TOKEN`. Zero switches the fee off.
    uint256 public maxCopyFee;

    uint256 private _copyFee;

    /// @notice A registration or renewal was paid for through this contract.
    /// @param payer Who called and received the change.
    /// @param tokenIn The token paid with, or zero for native PLS.
    /// @param amountIn How much of `tokenIn` the payer sent.
    /// @param price What the registrar was paid, in `PAYMENT_TOKEN`.
    /// @param change What was returned to the payer, in `PAYMENT_TOKEN`.
    /// @param renewal True for a renewal, false for a new registration.
    event Paid(
        address indexed payer, address indexed tokenIn, uint256 amountIn, uint256 price, uint256 change, bool renewal
    );

    /// @notice `payer` paid `fee` (in `PAYMENT_TOKEN`) to have `label`.hex copied to Ethereum at once.
    /// @param messageId The bridge message carrying the copy, which the bot claims on Ethereum.
    event CopyPaid(string label, address indexed payer, uint256 fee, bytes32 indexed messageId);

    /// @notice The bot set the copy fee.
    event CopyFeeSet(uint256 fee);

    /// @notice The owner chose the copy bot (zero: the fee is off).
    event CopyBotSet(address indexed bot);

    /// @notice The owner capped the copy fee (zero: the fee is off).
    event MaxCopyFeeSet(uint256 maxFee);

    /// @notice Only the copy bot may set the copy fee.
    error NotCopyBot();
    /// @notice There is no copy fee to pay: copies are free now, or too dear on Ethereum to offer.
    error NoCopyFee();
    /// @notice The copy could not be sent to Ethereum, so nothing was charged.
    error CopyFailed();

    /// @param registrar The .hex registrar.
    /// @param paymentToken A stablecoin the registrar accepts, e.g. USDC bridged from Ethereum.
    /// @param wpls Wrapped PLS.
    /// @param routers Uniswap-V2-style routers to allow, e.g. PulseX V1 and V2. Fixed for good.
    /// @param mirrorSync `HexMirrorSync`, or zero.
    /// @param admin Owns the copy fee's settings: the bot, and the most it may charge.
    /// @param bot The copy bot, or zero to choose it later.
    /// @param maxFee The most a copy may cost anyone, in `PAYMENT_TOKEN`.
    constructor(
        IETHRegistrar registrar,
        IERC20 paymentToken,
        IERC20 wpls,
        address[] memory routers,
        IHexMirrorSync mirrorSync,
        address admin,
        address bot,
        uint256 maxFee
    ) SwapPayments(paymentToken, wpls, routers) Ownable(admin) {
        if (address(registrar) == address(0)) revert ZeroAddress();
        REGISTRAR = registrar;
        MIRROR_SYNC = mirrorSync;
        copyBot = bot;
        maxCopyFee = maxFee;
        emit CopyBotSet(bot);
        emit MaxCopyFeeSet(maxFee);
    }

    // ------------------------------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------------------------------

    /// @notice Registers a name, paying with `amountIn` of `tokenIn`.
    /// @dev The caller must have approved this contract for `amountIn` of `tokenIn`, and must have
    ///      committed `reg` on the registrar beforehand. Quote with `quoteRegister`, then add a
    ///      buffer for price movement and for any transfer tax the token charges.
    /// @return tokenId The registrar's token id for the name.
    /// @return change `PAYMENT_TOKEN` returned to the caller.
    function registerWithToken(Registration calldata reg, IERC20 tokenIn, uint256 amountIn, Swap calldata swap)
        external
        nonReentrant
        returns (uint256 tokenId, uint256 change)
    {
        _validateRoute(address(tokenIn), swap.router, swap.path);
        uint256 got = _toPaymentToken(tokenIn, _pull(tokenIn, amountIn), swap);
        uint256 paid;
        (tokenId, paid,, change) = _payRegistration(reg, got, 0);
        emit Paid(msg.sender, address(tokenIn), amountIn, paid, change, false);
    }

    /// @notice Registers a name, paying with the PLS sent along with the call.
    /// @dev `swap.path` must start with WPLS. Change comes back in `PAYMENT_TOKEN`, not PLS.
    function registerWithPLS(Registration calldata reg, Swap calldata swap)
        external
        payable
        nonReentrant
        returns (uint256 tokenId, uint256 change)
    {
        _validateRoute(address(WRAPPED_NATIVE), swap.router, swap.path);
        uint256 got = _toPaymentToken(WRAPPED_NATIVE, _wrap(), swap);
        uint256 paid;
        (tokenId, paid,, change) = _payRegistration(reg, got, 0);
        emit Paid(msg.sender, address(0), msg.value, paid, change, false);
    }

    /// @notice `registerWithToken`, also paying the copy fee to have the name copied to Ethereum at
    ///         once, if there is one and it is at most `copyFeeLimit`.
    /// @dev Quote with `quoteRegisterAndCopy`. The purchase never fails over the fee: if there is
    ///      none to pay, or it has risen above `copyFeeLimit` or above what is left of the payment
    ///      after the price, nothing is charged for the copy, the rest comes back as change, and the
    ///      name is copied free once Ethereum's fees allow, as with `registerWithToken`.
    /// @return tokenId The registrar's token id for the name.
    /// @return change `PAYMENT_TOKEN` returned to the caller.
    /// @return fee The copy fee charged, or zero.
    function registerWithTokenAndCopy(
        Registration calldata reg,
        IERC20 tokenIn,
        uint256 amountIn,
        Swap calldata swap,
        uint256 copyFeeLimit
    ) external nonReentrant returns (uint256 tokenId, uint256 change, uint256 fee) {
        _validateRoute(address(tokenIn), swap.router, swap.path);
        uint256 got = _toPaymentToken(tokenIn, _pull(tokenIn, amountIn), swap);
        uint256 paid;
        (tokenId, paid, fee, change) = _payRegistration(reg, got, copyFeeLimit);
        emit Paid(msg.sender, address(tokenIn), amountIn, paid, change, false);
    }

    /// @notice `registerWithPLS`, also paying the copy fee: see `registerWithTokenAndCopy`.
    function registerWithPLSAndCopy(Registration calldata reg, Swap calldata swap, uint256 copyFeeLimit)
        external
        payable
        nonReentrant
        returns (uint256 tokenId, uint256 change, uint256 fee)
    {
        _validateRoute(address(WRAPPED_NATIVE), swap.router, swap.path);
        uint256 got = _toPaymentToken(WRAPPED_NATIVE, _wrap(), swap);
        uint256 paid;
        (tokenId, paid, fee, change) = _payRegistration(reg, got, copyFeeLimit);
        emit Paid(msg.sender, address(0), msg.value, paid, change, false);
    }

    // ------------------------------------------------------------------------------------------
    // Renewal
    // ------------------------------------------------------------------------------------------

    /// @notice Renews a name, paying with `amountIn` of `tokenIn`. Anyone can renew any name.
    /// @return change `PAYMENT_TOKEN` returned to the caller.
    function renewWithToken(Renewal calldata ren, IERC20 tokenIn, uint256 amountIn, Swap calldata swap)
        external
        nonReentrant
        returns (uint256 change)
    {
        _validateRoute(address(tokenIn), swap.router, swap.path);
        uint256 got = _toPaymentToken(tokenIn, _pull(tokenIn, amountIn), swap);
        uint256 paid;
        (paid,, change) = _payRenewal(ren, got, 0);
        emit Paid(msg.sender, address(tokenIn), amountIn, paid, change, true);
    }

    /// @notice Renews a name, paying with the PLS sent along with the call.
    function renewWithPLS(Renewal calldata ren, Swap calldata swap)
        external
        payable
        nonReentrant
        returns (uint256 change)
    {
        _validateRoute(address(WRAPPED_NATIVE), swap.router, swap.path);
        uint256 got = _toPaymentToken(WRAPPED_NATIVE, _wrap(), swap);
        uint256 paid;
        (paid,, change) = _payRenewal(ren, got, 0);
        emit Paid(msg.sender, address(0), msg.value, paid, change, true);
    }

    /// @notice `renewWithToken`, also paying the copy fee to have the new expiry copied to Ethereum
    ///         at once: see `registerWithTokenAndCopy`. Quote with `quoteRenewAndCopy`.
    /// @return change `PAYMENT_TOKEN` returned to the caller.
    /// @return fee The copy fee charged, or zero.
    function renewWithTokenAndCopy(
        Renewal calldata ren,
        IERC20 tokenIn,
        uint256 amountIn,
        Swap calldata swap,
        uint256 copyFeeLimit
    ) external nonReentrant returns (uint256 change, uint256 fee) {
        _validateRoute(address(tokenIn), swap.router, swap.path);
        uint256 got = _toPaymentToken(tokenIn, _pull(tokenIn, amountIn), swap);
        uint256 paid;
        (paid, fee, change) = _payRenewal(ren, got, copyFeeLimit);
        emit Paid(msg.sender, address(tokenIn), amountIn, paid, change, true);
    }

    /// @notice `renewWithPLS`, also paying the copy fee: see `registerWithTokenAndCopy`.
    function renewWithPLSAndCopy(Renewal calldata ren, Swap calldata swap, uint256 copyFeeLimit)
        external
        payable
        nonReentrant
        returns (uint256 change, uint256 fee)
    {
        _validateRoute(address(WRAPPED_NATIVE), swap.router, swap.path);
        uint256 got = _toPaymentToken(WRAPPED_NATIVE, _wrap(), swap);
        uint256 paid;
        (paid, fee, change) = _payRenewal(ren, got, copyFeeLimit);
        emit Paid(msg.sender, address(0), msg.value, paid, change, true);
    }

    // ------------------------------------------------------------------------------------------
    // Paying for a copy on its own
    // ------------------------------------------------------------------------------------------

    /// @notice Copies `label`.hex to Ethereum at once, paying the copy fee with `amountIn` of
    ///         `tokenIn`: after sending a name to another wallet while Ethereum is busy, say. The
    ///         rest comes back in `PAYMENT_TOKEN`.
    /// @dev Quote with `quoteCopyFee`. Reverts with `NoCopyFee` when there is no fee to pay (the
    ///      copy is free then), and with `InsufficientPayment` if the fee rose above the payment.
    /// @return fee The copy fee charged.
    /// @return change `PAYMENT_TOKEN` returned to the caller.
    function payCopyFee(string calldata label, IERC20 tokenIn, uint256 amountIn, Swap calldata swap)
        external
        nonReentrant
        returns (uint256 fee, uint256 change)
    {
        fee = _offeredFee();
        if (fee == 0) revert NoCopyFee();
        _validateRoute(address(tokenIn), swap.router, swap.path);
        change = _payCopy(label, fee, _toPaymentToken(tokenIn, _pull(tokenIn, amountIn), swap));
    }

    /// @notice `payCopyFee`, paying with the PLS sent along with the call. `swap.path` must start
    ///         with WPLS; change comes back in `PAYMENT_TOKEN`.
    function payCopyFeeWithPLS(string calldata label, Swap calldata swap)
        external
        payable
        nonReentrant
        returns (uint256 fee, uint256 change)
    {
        fee = _offeredFee();
        if (fee == 0) revert NoCopyFee();
        _validateRoute(address(WRAPPED_NATIVE), swap.router, swap.path);
        change = _payCopy(label, fee, _toPaymentToken(WRAPPED_NATIVE, _wrap(), swap));
    }

    // ------------------------------------------------------------------------------------------
    // Quotes, for websites
    // ------------------------------------------------------------------------------------------

    /// @notice The registrar's price for a registration, and roughly how much of `path[0]` buys it.
    /// @dev `amountIn` ignores transfer taxes and price movement; add a buffer before paying.
    ///      With an empty `path`, `amountIn` is the price in `PAYMENT_TOKEN` itself.
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

    /// @notice `quoteRegister` with the copy fee: the price, the fee to have the name copied to
    ///         Ethereum at once (zero when there is none to pay), and roughly how much of `path[0]`
    ///         pays both.
    function quoteRegisterAndCopy(string calldata label, uint64 duration, address router, address[] calldata path)
        external
        view
        returns (uint256 price, uint256 fee, uint256 amountIn)
    {
        price = _registerPrice(label, duration);
        fee = _offeredFee();
        amountIn = _quoteIn(price + fee, router, path);
    }

    /// @notice `quoteRenew` with the copy fee: see `quoteRegisterAndCopy`.
    function quoteRenewAndCopy(string calldata label, uint64 duration, address router, address[] calldata path)
        external
        view
        returns (uint256 price, uint256 fee, uint256 amountIn)
    {
        price = REGISTRAR.getRenewPrice(label, duration, PAYMENT_TOKEN);
        fee = _offeredFee();
        amountIn = _quoteIn(price + fee, router, path);
    }

    /// @notice The copy fee `payCopyFee` charges now (zero when there is none to pay), and roughly
    ///         how much of `path[0]` pays it.
    function quoteCopyFee(address router, address[] calldata path)
        external
        view
        returns (uint256 fee, uint256 amountIn)
    {
        fee = _offeredFee();
        if (fee != 0) amountIn = _quoteIn(fee, router, path);
    }

    // ------------------------------------------------------------------------------------------
    // The copy fee's settings
    // ------------------------------------------------------------------------------------------

    /// @notice The copy fee the bot asks for now, in `PAYMENT_TOKEN`: zero while copies are free
    ///         (or the fee is off), and above `maxCopyFee` while Ethereum is too busy to offer
    ///         copying at once. Only a fee from 1 up to `maxCopyFee` can be paid.
    function copyFee() public view returns (uint256) {
        return copyBot == address(0) || maxCopyFee == 0 ? 0 : _copyFee;
    }

    /// @notice Sets the copy fee. Only the copy bot, which keeps it in step with Ethereum's gas.
    function setCopyFee(uint256 fee) external {
        if (msg.sender != copyBot) revert NotCopyBot();
        _copyFee = fee;
        emit CopyFeeSet(fee);
    }

    /// @notice Chooses the copy bot, which sets the fee and receives it. Zero switches the fee off.
    ///         The fee starts at zero until the new bot sets it.
    function setCopyBot(address bot) external onlyOwner {
        copyBot = bot;
        _copyFee = 0;
        emit CopyBotSet(bot);
    }

    /// @notice Caps the copy fee, in `PAYMENT_TOKEN`. Zero switches the fee off.
    function setMaxCopyFee(uint256 maxFee) external onlyOwner {
        maxCopyFee = maxFee;
        emit MaxCopyFeeSet(maxFee);
    }

    // ------------------------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------------------------

    /// @dev Pays the registrar for `reg` out of `got`, and the copy fee if the caller agreed to it,
    ///      and returns the rest to the caller.
    function _payRegistration(Registration calldata reg, uint256 got, uint256 copyFeeLimit)
        private
        returns (uint256 tokenId, uint256 paid, uint256 fee, uint256 change)
    {
        uint256 price = _registerPrice(reg.label, reg.duration);
        if (got < price) revert InsufficientPayment(got, price);
        uint256 before = PAYMENT_TOKEN.balanceOf(address(this));
        PAYMENT_TOKEN.forceApprove(address(REGISTRAR), price);
        tokenId = _callRegister(reg);
        PAYMENT_TOKEN.forceApprove(address(REGISTRAR), 0);
        paid = before - PAYMENT_TOKEN.balanceOf(address(this));
        fee = _copy(reg.label, copyFeeLimit, got - paid);
        change = _refund(got - paid - fee);
    }

    function _callRegister(Registration calldata reg) private returns (uint256) {
        return REGISTRAR.register(
            reg.label, reg.owner, reg.secret, reg.subregistry, reg.resolver, reg.duration, PAYMENT_TOKEN, reg.referrer
        );
    }

    /// @dev Pays the registrar for `ren` out of `got`, and the copy fee if the caller agreed to it,
    ///      and returns the rest to the caller.
    function _payRenewal(Renewal calldata ren, uint256 got, uint256 copyFeeLimit)
        private
        returns (uint256 paid, uint256 fee, uint256 change)
    {
        uint256 price = REGISTRAR.getRenewPrice(ren.label, ren.duration, PAYMENT_TOKEN);
        if (got < price) revert InsufficientPayment(got, price);
        uint256 before = PAYMENT_TOKEN.balanceOf(address(this));
        PAYMENT_TOKEN.forceApprove(address(REGISTRAR), price);
        REGISTRAR.renew(ren.label, ren.duration, PAYMENT_TOKEN, ren.referrer);
        PAYMENT_TOKEN.forceApprove(address(REGISTRAR), 0);
        paid = before - PAYMENT_TOKEN.balanceOf(address(this));
        fee = _copy(ren.label, copyFeeLimit, got - paid);
        change = _refund(got - paid - fee);
    }

    function _registerPrice(string calldata label, uint64 duration) private view returns (uint256) {
        (uint256 base, uint256 premium) = REGISTRAR.getRegisterPrice(label, duration, PAYMENT_TOKEN);
        return base + premium;
    }

    /// @dev The copy fee that can be paid now: zero if there is none, or it is above the cap.
    function _offeredFee() private view returns (uint256 fee) {
        fee = copyFee();
        if (fee > maxCopyFee) fee = 0;
    }

    /// @dev Sends `label` to the Ethereum copy after a purchase, charging the copy fee if there is
    ///      one up to `limit` and `available`, and the copy went out. Returns the fee charged.
    function _copy(string calldata label, uint256 limit, uint256 available) private returns (uint256 fee) {
        (bool sent, bytes32 messageId) = _trySync(label);
        fee = _offeredFee();
        if (!sent || fee == 0 || fee > limit || fee > available) return 0;
        _chargeCopy(label, fee, messageId);
    }

    /// @dev Sends `label` to the Ethereum copy and charges `fee` out of `got`; returns the change.
    function _payCopy(string calldata label, uint256 fee, uint256 got) private returns (uint256 change) {
        if (got < fee) revert InsufficientPayment(got, fee);
        (bool sent, bytes32 messageId) = _trySync(label);
        if (!sent) revert CopyFailed();
        _chargeCopy(label, fee, messageId);
        change = _refund(got - fee);
    }

    function _chargeCopy(string calldata label, uint256 fee, bytes32 messageId) private {
        PAYMENT_TOKEN.safeTransfer(copyBot, fee);
        emit CopyPaid(label, msg.sender, fee, messageId);
    }

    /// @dev Copies the name to Ethereum. Best effort: a failure here never blocks a purchase.
    function _trySync(string calldata label) private returns (bool sent, bytes32 messageId) {
        if (address(MIRROR_SYNC) == address(0)) return (false, 0);
        try MIRROR_SYNC.sync(label) returns (bytes32 id) {
            return (true, id);
        } catch {
            return (false, 0);
        }
    }
}
