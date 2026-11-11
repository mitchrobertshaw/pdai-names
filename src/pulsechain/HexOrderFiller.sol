// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IETHRegistrar} from "@ensv2/registrar/interfaces/IETHRegistrar.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";

import {BridgeLink} from "../common/BridgeLink.sol";
import {ZeroAddress} from "../common/Errors.sol";
import {IAMB} from "../interfaces/IAMB.sol";
import {IHexMirrorSync, IHexOrderSettlement} from "../interfaces/IHexBridge.sol";

/// @title HexOrderFiller
/// @notice Completes .hex orders placed on Ethereum, and tells Ethereum over the bridge.
/// @dev The flow for a buyer on Ethereum:
///        1. They pay into `HexOrderBook` on Ethereum with an order holding only the registrar
///           commitment for their name, so the name is not visible until it is registered.
///        2. A filler (normally the hex-names bot, but anyone who knows the details may do it)
///           commits that commitment on the PulseChain registrar, waits the registrar's minimum
///           commitment age, then calls `fill` here with the details. This registers the name to
///           the buyer, paid for out of the filler's own stablecoins, and sends a message to
///           Ethereum saying the order was filled and who to pay.
///        3. When the bridge delivers that message, about 15 minutes later, `HexOrderBook` pays the
///           buyer's money to the filler.
///      If the order cannot be filled (the name is taken, the details are invalid, or its deadline
///      passed), `reportUnfillable` or `reportExpired` sends a message that refunds the buyer instead.
///
///      Each order can only be closed once here, filled or not, so a buyer can never be both
///      refunded and given the name. Fills are refused after the order's deadline, and Ethereum
///      checks the deadline and commitment again, so a filler cannot claim the wrong order.
///      This contract holds nothing between calls and has no owner.
contract HexOrderFiller is BridgeLink, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The details behind an order's commitment, as passed to the registrar.
    struct Reveal {
        string label; // the name without .hex
        address owner;
        bytes32 secret;
        IRegistry subregistry;
        address resolver;
        uint64 duration; // seconds
        bytes32 referrer;
    }

    /// @notice How an order was closed here.
    enum Outcome {
        OPEN,
        FILLED,
        UNFILLABLE
    }

    /// @notice The .hex registrar on PulseChain.
    IETHRegistrar public immutable REGISTRAR;

    /// @notice Sends filled names to the Ethereum copy straight away, or zero to skip that.
    IHexMirrorSync public immutable MIRROR_SYNC;

    /// @notice A payment token the registrar accepts, used to check whether an order can be filled.
    IERC20 public immutable CHECK_TOKEN;

    /// @notice Gas each settlement message asks for on Ethereum.
    uint256 public immutable SETTLE_GAS;

    /// @notice How each order was closed, by `orderKey`.
    mapping(bytes32 orderKey => Outcome outcome) public outcomeOf;

    /// @notice An order was filled: its name was registered and Ethereum was told to pay `payee`.
    event OrderFilled(
        uint256 indexed orderId,
        bytes32 indexed commitment,
        address indexed payee,
        uint256 tokenId,
        uint256 price,
        bytes32 messageId
    );

    /// @notice An order could not be filled and Ethereum was told to refund the buyer.
    event OrderUnfillable(uint256 indexed orderId, bytes32 indexed commitment, bytes32 messageId);

    /// @notice The order's deadline has passed, so it can no longer be filled.
    error OrderPastDeadline(uint64 deadline);
    /// @notice The order has not reached its deadline yet.
    error OrderNotExpired(uint64 deadline);
    /// @notice The order was already filled or reported here.
    error OrderClosed(bytes32 orderKey);
    /// @notice The order can still be filled, so it cannot be reported as unfillable.
    error OrderFillable();
    /// @notice `settleGas` is more than the bridge allows.
    error GasTooHigh(uint256 gas, uint256 max);

    /// @param amb The bridge's message contract on PulseChain.
    /// @param ethereumChainId The chain id of Ethereum (1).
    /// @param linker Who may set the Ethereum `HexOrderBook`, once.
    /// @param registrar The .hex registrar on PulseChain.
    /// @param mirrorSync Sends names to the Ethereum copy after a fill, or zero to skip.
    /// @param checkToken A payment token the registrar accepts.
    /// @param settleGas Gas each settlement message asks for on Ethereum.
    constructor(
        IAMB amb,
        uint256 ethereumChainId,
        address linker,
        IETHRegistrar registrar,
        IHexMirrorSync mirrorSync,
        IERC20 checkToken,
        uint256 settleGas
    ) BridgeLink(amb, ethereumChainId, linker) {
        if (address(registrar) == address(0) || address(checkToken) == address(0)) {
            revert ZeroAddress();
        }
        uint256 max = amb.maxGasPerTx();
        if (settleGas > max) revert GasTooHigh(settleGas, max);
        REGISTRAR = registrar;
        MIRROR_SYNC = mirrorSync;
        CHECK_TOKEN = checkToken;
        SETTLE_GAS = settleGas;
    }

    // ------------------------------------------------------------------------------------------
    // Closing orders
    // ------------------------------------------------------------------------------------------

    /// @notice Registers an Ethereum order's name to its buyer and tells Ethereum to pay `payee`.
    /// @dev The caller pays the registrar's price in `paymentToken`, so must have approved this
    ///      contract for it, and the commitment must have been committed on the registrar at least
    ///      the minimum commitment age ago. The order's commitment binds every detail of the
    ///      registration, including its owner, so a filler can only register what the buyer asked for.
    /// @param orderId The order's id in `HexOrderBook` on Ethereum.
    /// @param deadline The order's fill deadline.
    /// @param reveal The details behind the order's commitment.
    /// @param paymentToken The token the caller pays the registrar with.
    /// @param payee Who `HexOrderBook` pays on Ethereum.
    /// @return tokenId The registrar's token id for the name.
    function fill(uint256 orderId, uint64 deadline, Reveal calldata reveal, IERC20 paymentToken, address payee)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        if (block.timestamp > deadline) revert OrderPastDeadline(deadline);
        if (payee == address(0)) revert ZeroAddress();
        bytes32 commitment = commitmentOf(reveal);
        _close(orderId, commitment, deadline, Outcome.FILLED);
        uint256 price;
        (tokenId, price) = _register(reveal, paymentToken);
        bytes32 messageId = _sendToPeer(
            abi.encodeCall(IHexOrderSettlement.settle, (orderId, commitment, deadline, payee, true)), SETTLE_GAS
        );
        emit OrderFilled(orderId, commitment, payee, tokenId, price, messageId);
        _trySync(reveal.label);
    }

    /// @notice Refunds an Ethereum order whose name cannot be registered: it is taken, its details
    ///         are invalid (too short, an unpriced length, no owner), or its deadline has passed.
    /// @dev Needs the details behind the commitment, which only the buyer and the filler know.
    function reportUnfillable(uint256 orderId, uint64 deadline, Reveal calldata reveal)
        external
        returns (bytes32 messageId)
    {
        bytes32 commitment = commitmentOf(reveal);
        if (block.timestamp <= deadline && canRegister(reveal)) revert OrderFillable();
        _close(orderId, commitment, deadline, Outcome.UNFILLABLE);
        messageId = _sendRefund(orderId, commitment, deadline);
    }

    /// @notice Refunds an Ethereum order that was not filled by its deadline. Anyone may call this,
    ///         and the details behind the commitment are not needed.
    function reportExpired(uint256 orderId, bytes32 commitment, uint64 deadline) external returns (bytes32 messageId) {
        if (block.timestamp <= deadline) revert OrderNotExpired(deadline);
        _close(orderId, commitment, deadline, Outcome.UNFILLABLE);
        messageId = _sendRefund(orderId, commitment, deadline);
    }

    // ------------------------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------------------------

    /// @notice The key an order is recorded under here.
    function orderKey(uint256 orderId, bytes32 commitment, uint64 deadline) public pure returns (bytes32) {
        return keccak256(abi.encode(orderId, commitment, deadline));
    }

    /// @notice The registrar commitment for `reveal`.
    function commitmentOf(Reveal calldata reveal) public view returns (bytes32) {
        return REGISTRAR.makeCommitment(
            reveal.label,
            reveal.owner,
            reveal.secret,
            reveal.subregistry,
            reveal.resolver,
            reveal.duration,
            reveal.referrer
        );
    }

    /// @notice Whether the registrar would register `reveal` now, ignoring the commitment's age.
    function canRegister(Reveal calldata reveal) public view returns (bool) {
        if (reveal.owner == address(0) || !REGISTRAR.isAvailable(reveal.label)) return false;
        try REGISTRAR.getRegisterPrice(reveal.label, reveal.duration, CHECK_TOKEN) returns (uint256, uint256) {
            return true;
        } catch {
            return false;
        }
    }

    // ------------------------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------------------------

    function _close(uint256 orderId, bytes32 commitment, uint64 deadline, Outcome outcome)
        private
        returns (bytes32 key)
    {
        key = orderKey(orderId, commitment, deadline);
        if (outcomeOf[key] != Outcome.OPEN) revert OrderClosed(key);
        outcomeOf[key] = outcome;
    }

    /// @dev Registers `reveal`, paid for by the caller in `paymentToken`.
    function _register(Reveal calldata reveal, IERC20 paymentToken) private returns (uint256 tokenId, uint256 price) {
        (uint256 base, uint256 premium) = REGISTRAR.getRegisterPrice(reveal.label, reveal.duration, paymentToken);
        price = base + premium;
        paymentToken.safeTransferFrom(msg.sender, address(this), price);
        paymentToken.forceApprove(address(REGISTRAR), price);
        tokenId = REGISTRAR.register(
            reveal.label,
            reveal.owner,
            reveal.secret,
            reveal.subregistry,
            reveal.resolver,
            reveal.duration,
            paymentToken,
            reveal.referrer
        );
        paymentToken.forceApprove(address(REGISTRAR), 0);
    }

    function _sendRefund(uint256 orderId, bytes32 commitment, uint64 deadline) private returns (bytes32 messageId) {
        messageId = _sendToPeer(
            abi.encodeCall(IHexOrderSettlement.settle, (orderId, commitment, deadline, address(0), false)), SETTLE_GAS
        );
        emit OrderUnfillable(orderId, commitment, messageId);
    }

    /// @dev Copies the new name to Ethereum. Best effort: a failure here never blocks a fill.
    function _trySync(string calldata label) private {
        if (address(MIRROR_SYNC) == address(0)) return;
        try MIRROR_SYNC.sync(label) {} catch {}
    }
}
