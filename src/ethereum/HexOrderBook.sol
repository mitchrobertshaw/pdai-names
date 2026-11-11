// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {BridgeLink} from "../common/BridgeLink.sol";
import {SwapPayments} from "../common/SwapPayments.sol";
import {IAMB} from "../interfaces/IAMB.sol";
import {IHexOrderSettlement} from "../interfaces/IHexBridge.sol";

/// @title HexOrderBook
/// @notice Buy a .hex name from Ethereum. The money waits here until PulseChain confirms the name
///         was registered to the buyer, then goes to whoever registered it.
/// @dev The flow:
///        1. The buyer places an order: they pay, in USDC or any token or ETH that is swapped to
///           USDC, and give the registrar commitment for their name plus the details behind it
///           encrypted for the filler. The commitment hides the name until it is registered.
///        2. A filler registers the name to the buyer on PulseChain within minutes, paying from its
///           own stablecoins, through `HexOrderFiller`, which sends a message back over the bridge.
///        3. When the bridge delivers it, `settle` pays the order's money to the filler. If the
///           name could not be registered, the message refunds the buyer instead.
///        4. If no message arrives at all, the buyer can take the money back with `reclaim` once
///           `RECLAIM_DELAY` has passed after the fill deadline.
///      Only messages sent by the linked `HexOrderFiller` on PulseChain, delivered by the official
///      bridge, can settle an order, and each order settles once. No owner and no admin functions.
contract HexOrderBook is BridgeLink, SwapPayments, ReentrancyGuard, IHexOrderSettlement {
    using SafeERC20 for IERC20;

    /// @notice Where an order is.
    enum Status {
        NONE,
        OPEN,
        FILLED,
        REFUNDED,
        RECLAIMED
    }

    /// @notice An order.
    struct Order {
        address buyer; // who paid, and who refunds go to
        uint96 amount; // USDC held for the order
        bytes32 commitment; // the registrar commitment for the name
        uint64 deadline; // the name must be registered on PulseChain by this time
        Status status;
    }

    /// @notice How long a filler has to register an order's name, from when it is placed.
    uint64 public immutable FILL_WINDOW;

    /// @notice How long after the fill deadline the buyer must wait before `reclaim`, so that a fill
    ///         made in time has had ample time to arrive over the bridge.
    uint64 public immutable RECLAIM_DELAY;

    /// @notice The number of orders placed. Order ids start at 1.
    uint256 public orderCount;

    /// @notice Orders, by id.
    mapping(uint256 orderId => Order order) public orders;

    /// @notice USDC owed to an account because a direct transfer to it failed. Withdraw with `withdraw`.
    mapping(address account => uint256 amount) public owed;

    /// @notice An order was placed. `encryptedReveal` holds the details behind `commitment`,
    ///         encrypted for the filler.
    event OrderPlaced(
        uint256 indexed orderId,
        address indexed buyer,
        bytes32 indexed commitment,
        uint256 amount,
        uint64 deadline,
        bytes encryptedReveal
    );

    /// @notice An order was closed and its money sent to `to`.
    event OrderSettled(uint256 indexed orderId, Status status, address indexed to, uint256 amount);

    /// @notice A settlement message did not match an open order, and changed nothing.
    event SettlementIgnored(uint256 indexed orderId, bytes32 commitment, uint64 deadline, bool filled);

    /// @notice A transfer failed, so the amount was recorded in `owed` instead.
    event PaymentDeferred(address indexed to, uint256 amount);

    /// @notice An account withdrew what it was owed.
    event Withdrawn(address indexed account, uint256 amount);

    /// @notice The order amount is zero or too large.
    error InvalidAmount();
    /// @notice The commitment is zero.
    error InvalidCommitment();
    /// @notice The order is not open.
    error OrderNotOpen(uint256 orderId);
    /// @notice `reclaim` was called before `RECLAIM_DELAY` had passed after the deadline.
    error TooEarly(uint256 availableAt);

    /// @param amb The bridge's message contract on Ethereum.
    /// @param pulseChainId The chain id of PulseChain (369).
    /// @param linker Who may set the PulseChain `HexOrderFiller`, once.
    /// @param usdc USDC, the token orders are held in.
    /// @param weth Wrapped ETH, used for orders paid in ETH.
    /// @param routers Uniswap-V2-style routers to allow, e.g. Uniswap V2. Fixed for good.
    /// @param fillWindow How long a filler has to register an order's name.
    /// @param reclaimDelay How long after the fill deadline a buyer may reclaim an unsettled order.
    constructor(
        IAMB amb,
        uint256 pulseChainId,
        address linker,
        IERC20 usdc,
        IERC20 weth,
        address[] memory routers,
        uint64 fillWindow,
        uint64 reclaimDelay
    ) BridgeLink(amb, pulseChainId, linker) SwapPayments(usdc, weth, routers) {
        FILL_WINDOW = fillWindow;
        RECLAIM_DELAY = reclaimDelay;
    }

    // ------------------------------------------------------------------------------------------
    // Placing orders
    // ------------------------------------------------------------------------------------------

    /// @notice Places an order paid in USDC. The caller must have approved `amount`.
    /// @param commitment The registrar commitment for the name, from the registrar's `makeCommitment`.
    /// @param amount USDC to hold for the order: the registrar's price plus the filler's fee.
    /// @param encryptedReveal The details behind `commitment`, encrypted for the filler.
    function placeOrder(bytes32 commitment, uint256 amount, bytes calldata encryptedReveal)
        external
        nonReentrant
        returns (uint256 orderId)
    {
        uint256 got = _pull(PAYMENT_TOKEN, amount);
        if (got < amount) revert InsufficientPayment(got, amount);
        orderId = _open(commitment, amount, encryptedReveal);
    }

    /// @notice Places an order paid with `amountIn` of `tokenIn`, swapped to USDC. Any USDC beyond
    ///         `amount` is sent back. The caller must have approved `amountIn` of `tokenIn`.
    function placeOrderWithToken(
        bytes32 commitment,
        uint256 amount,
        bytes calldata encryptedReveal,
        IERC20 tokenIn,
        uint256 amountIn,
        Swap calldata swap
    ) external nonReentrant returns (uint256 orderId, uint256 change) {
        _validateRoute(address(tokenIn), swap.router, swap.path);
        uint256 got = _toPaymentToken(tokenIn, _pull(tokenIn, amountIn), swap);
        if (got < amount) revert InsufficientPayment(got, amount);
        orderId = _open(commitment, amount, encryptedReveal);
        change = _refund(got - amount);
    }

    /// @notice Places an order paid with the ETH sent along, swapped to USDC. Any USDC beyond
    ///         `amount` is sent back. `swap.path` must start with WETH.
    function placeOrderWithETH(bytes32 commitment, uint256 amount, bytes calldata encryptedReveal, Swap calldata swap)
        external
        payable
        nonReentrant
        returns (uint256 orderId, uint256 change)
    {
        _validateRoute(address(WRAPPED_NATIVE), swap.router, swap.path);
        uint256 got = _toPaymentToken(WRAPPED_NATIVE, _wrap(), swap);
        if (got < amount) revert InsufficientPayment(got, amount);
        orderId = _open(commitment, amount, encryptedReveal);
        change = _refund(got - amount);
    }

    /// @notice Roughly how much of `path[0]` buys `amount` USDC. Ignores transfer taxes; add a buffer.
    function quote(uint256 amount, address router, address[] calldata path) external view returns (uint256 amountIn) {
        return _quoteIn(amount, router, path);
    }

    // ------------------------------------------------------------------------------------------
    // Closing orders
    // ------------------------------------------------------------------------------------------

    /// @inheritdoc IHexOrderSettlement
    /// @dev Only the bridge, delivering a message from the linked PulseChain `HexOrderFiller`, may
    ///      call this. A message that does not match an open order changes nothing, rather than
    ///      reverting, so it is not left failed on the bridge.
    function settle(uint256 orderId, bytes32 commitment, uint64 deadline, address payee, bool filled)
        external
        onlyPeerMessage
        nonReentrant
    {
        Order storage order = orders[orderId];
        if (order.status != Status.OPEN || order.commitment != commitment || order.deadline != deadline) {
            emit SettlementIgnored(orderId, commitment, deadline, filled);
            return;
        }
        if (filled) {
            order.status = Status.FILLED;
            _pay(payee, order.amount, orderId, Status.FILLED);
        } else {
            order.status = Status.REFUNDED;
            _pay(order.buyer, order.amount, orderId, Status.REFUNDED);
        }
    }

    /// @notice Refunds an order that was never settled, once `RECLAIM_DELAY` has passed after its
    ///         fill deadline. Anyone may call it; the money always goes to the buyer.
    function reclaim(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.status != Status.OPEN) revert OrderNotOpen(orderId);
        uint256 availableAt = uint256(order.deadline) + RECLAIM_DELAY;
        if (block.timestamp <= availableAt) revert TooEarly(availableAt + 1);
        order.status = Status.RECLAIMED;
        _pay(order.buyer, order.amount, orderId, Status.RECLAIMED);
    }

    /// @notice Withdraws USDC owed to the caller after a transfer to it failed.
    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        owed[msg.sender] = 0;
        PAYMENT_TOKEN.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------------------------

    function _open(bytes32 commitment, uint256 amount, bytes calldata encryptedReveal)
        private
        returns (uint256 orderId)
    {
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (amount == 0 || amount > type(uint96).max) revert InvalidAmount();
        orderId = ++orderCount;
        uint64 deadline = uint64(block.timestamp) + FILL_WINDOW;
        orders[orderId] = Order({
            buyer: msg.sender, amount: uint96(amount), commitment: commitment, deadline: deadline, status: Status.OPEN
        });
        emit OrderPlaced(orderId, msg.sender, commitment, amount, deadline, encryptedReveal);
    }

    /// @dev Sends USDC to `to`. If the transfer fails (for example, `to` is blocked by the token),
    ///      the amount is recorded in `owed` instead, so a bridge message never fails because of it.
    function _pay(address to, uint256 amount, uint256 orderId, Status status) private {
        (bool ok, bytes memory ret) = address(PAYMENT_TOKEN).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool))) || address(PAYMENT_TOKEN).code.length == 0) {
            owed[to] += amount;
            emit PaymentDeferred(to, amount);
        }
        emit OrderSettled(orderId, status, to, amount);
    }
}
