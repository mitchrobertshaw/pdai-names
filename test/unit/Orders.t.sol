// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BridgeLink} from "../../src/common/BridgeLink.sol";
import {SwapPayments} from "../../src/common/SwapPayments.sol";
import {HexOrderBook} from "../../src/ethereum/HexOrderBook.sol";
import {IHexOrderSettlement} from "../../src/interfaces/IHexBridge.sol";
import {HexOrderFiller} from "../../src/pulsechain/HexOrderFiller.sol";
import {HexTestBase} from "../helpers/HexTestBase.sol";

/// @notice Buying a .hex name from Ethereum: the order, the fill on PulseChain, and settlement.
contract OrdersTest is HexTestBase {
    uint256 internal constant FEE = 0.25e6; // the filler's fee in this test, in USDC
    bytes internal constant SEALED = hex"c0ffee"; // stands in for the encrypted details

    function setUp() public override {
        super.setUp();
        plsUsdc.mint(bot, 1_000e6);
        vm.prank(bot);
        plsUsdc.approve(address(hub.orderFiller), type(uint256).max);
    }

    // ------------------------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------------------------

    function _price(string memory label, uint64 duration) internal view returns (uint256) {
        (uint256 base, uint256 premium) = hub.registrar.getRegisterPrice(label, duration, plsUsdc);
        return base + premium;
    }

    /// @dev `buyer` places an order on Ethereum for `r`, paid in USDC.
    function _placeOrder(address buyer, HexOrderFiller.Reveal memory r)
        internal
        returns (uint256 orderId, uint256 amount)
    {
        amount = _price(r.label, r.duration) + FEE;
        ethUsdc.mint(buyer, amount);
        vm.startPrank(buyer);
        ethUsdc.approve(address(mirror.orderBook), amount);
        orderId = mirror.orderBook.placeOrder(_commitmentOf(r), amount, SEALED);
        vm.stopPrank();
    }

    function _deadline(uint256 orderId) internal view returns (uint64 deadline) {
        (,,, deadline,) = mirror.orderBook.orders(orderId);
    }

    function _status(uint256 orderId) internal view returns (HexOrderBook.Status status) {
        (,,,, status) = mirror.orderBook.orders(orderId);
    }

    /// @dev What the bot does: commit on PulseChain, wait a minute, fill.
    function _fill(uint256 orderId, HexOrderFiller.Reveal memory r) internal returns (uint256 tokenId) {
        uint64 deadline = _deadline(orderId);
        hub.registrar.commit(_commitmentOf(r));
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
        vm.prank(bot);
        tokenId = hub.orderFiller.fill(orderId, deadline, r, plsUsdc, bot);
    }

    // ------------------------------------------------------------------------------------------
    // The happy path
    // ------------------------------------------------------------------------------------------

    function test_buyFromEthereum_endToEnd() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        uint256 placedAt = block.timestamp;
        uint256 price = _price("alice", ONE_YEAR);
        (uint256 orderId, uint256 amount) = _placeOrder(alice, r);
        assertEq(ethUsdc.balanceOf(address(mirror.orderBook)), amount, "held in the order book");
        assertEq(_deadline(orderId), placedAt + FILL_WINDOW);

        uint256 botBefore = plsUsdc.balanceOf(bot);
        _fill(orderId, r);

        // On PulseChain: the name is alice's, and the bot paid the registrar.
        assertEq(hub.core.hexRegistry.findOwner("alice"), alice);
        assertEq(botBefore - plsUsdc.balanceOf(bot), price, "bot paid the price");
        assertEq(plsUsdc.balanceOf(beneficiary), amount - FEE, "registration fee reached the beneficiary");
        assertLe(block.timestamp - placedAt, 2 minutes, "registered within about a minute of the order");

        // Over the bridge: the bot is paid on Ethereum and the Ethereum copy appears.
        assertEq(_relayToEthereum(), 2, "a settlement and a copy");
        assertEq(ethUsdc.balanceOf(bot), amount, "bot got the order's money");
        assertEq(ethUsdc.balanceOf(address(mirror.orderBook)), 0);
        assertEq(uint8(_status(orderId)), uint8(HexOrderBook.Status.FILLED));
        assertEq(mirror.core.hexRegistry.findOwner("alice"), alice);
        assertEq(_resolveEthAddr(mirror.core, "alice.hex"), alice);
    }

    function test_order_payWithETH() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        uint256 amount = _price("alice", ONE_YEAR) + FEE;
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(ethUsdc);
        uint256 ethIn = mirror.orderBook.quote(amount, address(uniswap), path) * 102 / 100;
        bytes32 commitment = _commitmentOf(r);
        vm.deal(alice, ethIn);
        vm.prank(alice);
        (uint256 orderId, uint256 change) = mirror.orderBook.placeOrderWithETH{value: ethIn}(
            commitment, amount, SEALED, SwapPayments.Swap(address(uniswap), path, amount, block.timestamp)
        );
        assertGt(change, 0);
        assertEq(ethUsdc.balanceOf(alice), change, "change in USDC");
        assertEq(ethUsdc.balanceOf(address(mirror.orderBook)), amount);
        _fill(orderId, r);
        _relayToEthereum();
        assertEq(ethUsdc.balanceOf(bot), amount);
    }

    function test_order_payWithHEX() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        uint256 amount = _price("alice", ONE_YEAR) + FEE;
        address[] memory path = new address[](2);
        path[0] = address(eHex);
        path[1] = address(ethUsdc);
        uint256 hexIn = mirror.orderBook.quote(amount, address(uniswap), path) * 102 / 100;
        eHex.mint(alice, hexIn);
        vm.startPrank(alice);
        eHex.approve(address(mirror.orderBook), hexIn);
        (uint256 orderId,) = mirror.orderBook
            .placeOrderWithToken(
                _commitmentOf(r),
                amount,
                SEALED,
                IERC20(address(eHex)),
                hexIn,
                SwapPayments.Swap(address(uniswap), path, amount, block.timestamp)
            );
        vm.stopPrank();
        assertEq(mirror.orderBook.orderCount(), orderId);
        assertEq(eHex.balanceOf(address(mirror.orderBook)), 0, "no HEX left behind");
    }

    function test_order_swapThatComesUpShortReverts() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        uint256 amount = _price("alice", ONE_YEAR) + FEE;
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(ethUsdc);
        uint256 ethIn = mirror.orderBook.quote(amount, address(uniswap), path) / 2;
        uint256 expectedOut = ethIn * 3500e6 / 1e18;
        bytes32 commitment = _commitmentOf(r);
        vm.deal(alice, ethIn);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SwapPayments.InsufficientPayment.selector, expectedOut, amount));
        mirror.orderBook.placeOrderWithETH{value: ethIn}(
            commitment, amount, SEALED, SwapPayments.Swap(address(uniswap), path, 0, block.timestamp)
        );
    }

    function test_order_unknownRouterRejected() public {
        address[] memory path = new address[](2);
        path[0] = address(eHex);
        path[1] = address(ethUsdc);
        vm.expectRevert(abi.encodeWithSelector(SwapPayments.RouterNotAllowed.selector, address(pulsex)));
        mirror.orderBook
            .placeOrderWithToken(
                bytes32(uint256(1)),
                1e6,
                SEALED,
                IERC20(address(eHex)),
                1,
                SwapPayments.Swap(address(pulsex), path, 0, block.timestamp)
            );
    }

    function test_order_rejectsZeroCommitmentAndAmount() public {
        ethUsdc.mint(alice, 10e6);
        vm.startPrank(alice);
        ethUsdc.approve(address(mirror.orderBook), 10e6);
        vm.expectRevert(HexOrderBook.InvalidCommitment.selector);
        mirror.orderBook.placeOrder(bytes32(0), 1e6, SEALED);
        vm.expectRevert(HexOrderBook.InvalidAmount.selector);
        mirror.orderBook.placeOrder(bytes32(uint256(1)), 0, SEALED);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------------------------------
    // Refunds
    // ------------------------------------------------------------------------------------------

    function test_refund_nameTakenFirst() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId, uint256 amount) = _placeOrder(alice, r);
        _registerDirect("alice", bob, ONE_YEAR); // bob buys it on PulseChain first

        hub.orderFiller.reportUnfillable(orderId, _deadline(orderId), r);
        _relayToEthereum();

        assertEq(ethUsdc.balanceOf(alice), amount, "refunded");
        assertEq(uint8(_status(orderId)), uint8(HexOrderBook.Status.REFUNDED));
        // And it can no longer be filled.
        hub.registrar.commit(_commitmentOf(r));
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
        uint64 deadline = _deadline(orderId);
        vm.prank(bot);
        vm.expectRevert();
        hub.orderFiller.fill(orderId, deadline, r, plsUsdc, bot);
    }

    function test_refund_invalidName() public {
        HexOrderFiller.Reveal memory r = _reveal("ab", alice, ONE_YEAR); // 2 letters: not for sale
        uint256 amount = 10e6;
        ethUsdc.mint(alice, amount);
        vm.startPrank(alice);
        ethUsdc.approve(address(mirror.orderBook), amount);
        uint256 orderId = mirror.orderBook.placeOrder(_commitmentOf(r), amount, SEALED);
        vm.stopPrank();
        hub.orderFiller.reportUnfillable(orderId, _deadline(orderId), r);
        _relayToEthereum();
        assertEq(ethUsdc.balanceOf(alice), amount);
    }

    function test_refund_nameTooLong() public {
        string memory label = "abcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcd"; // 64: over the cap
        assertEq(bytes(label).length, 64);
        HexOrderFiller.Reveal memory r = _reveal(label, alice, ONE_YEAR);
        assertFalse(hub.orderFiller.canRegister(r));
        uint256 amount = 10e6;
        ethUsdc.mint(alice, amount);
        vm.startPrank(alice);
        ethUsdc.approve(address(mirror.orderBook), amount);
        uint256 orderId = mirror.orderBook.placeOrder(_commitmentOf(r), amount, SEALED);
        vm.stopPrank();
        hub.orderFiller.reportUnfillable(orderId, _deadline(orderId), r);
        _relayToEthereum();
        assertEq(ethUsdc.balanceOf(alice), amount);
    }

    function test_refund_cannotReportAFillableOrder() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        uint64 deadline = _deadline(orderId);
        vm.expectRevert(HexOrderFiller.OrderFillable.selector);
        hub.orderFiller.reportUnfillable(orderId, deadline, r);
    }

    function test_refund_afterDeadline_anyoneWithoutDetails() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId, uint256 amount) = _placeOrder(alice, r);
        uint64 deadline = _deadline(orderId);
        bytes32 commitment = _commitmentOf(r);

        vm.expectRevert(abi.encodeWithSelector(HexOrderFiller.OrderNotExpired.selector, deadline));
        hub.orderFiller.reportExpired(orderId, commitment, deadline);

        vm.warp(deadline + 1);
        vm.prank(bob);
        hub.orderFiller.reportExpired(orderId, commitment, deadline);
        _relayToEthereum();
        assertEq(ethUsdc.balanceOf(alice), amount);
    }

    function test_refund_reclaimWhenNothingArrives() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId, uint256 amount) = _placeOrder(alice, r);
        uint64 deadline = _deadline(orderId);

        vm.warp(uint256(deadline) + RECLAIM_DELAY);
        vm.expectRevert(abi.encodeWithSelector(HexOrderBook.TooEarly.selector, uint256(deadline) + RECLAIM_DELAY + 1));
        mirror.orderBook.reclaim(orderId);

        vm.warp(uint256(deadline) + RECLAIM_DELAY + 1);
        vm.prank(bob); // anyone may trigger it; the money goes to the buyer
        mirror.orderBook.reclaim(orderId);
        assertEq(ethUsdc.balanceOf(alice), amount);
        assertEq(uint8(_status(orderId)), uint8(HexOrderBook.Status.RECLAIMED));

        vm.expectRevert(abi.encodeWithSelector(HexOrderBook.OrderNotOpen.selector, orderId));
        mirror.orderBook.reclaim(orderId);
    }

    // ------------------------------------------------------------------------------------------
    // Never both the name and the money
    // ------------------------------------------------------------------------------------------

    function test_once_filledOrderCannotThenBeRefunded() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        _fill(orderId, r);
        uint64 deadline = _deadline(orderId);
        bytes32 key = hub.orderFiller.orderKey(orderId, _commitmentOf(r), deadline);

        // The name is now taken (by alice), but that does not make her order "unfillable".
        bytes32 commitment = _commitmentOf(r);
        vm.expectRevert(abi.encodeWithSelector(HexOrderFiller.OrderClosed.selector, key));
        hub.orderFiller.reportUnfillable(orderId, deadline, r);
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(HexOrderFiller.OrderClosed.selector, key));
        hub.orderFiller.reportExpired(orderId, commitment, deadline);
    }

    function test_once_reportedOrderCannotThenBeFilled() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        uint64 deadline = _deadline(orderId);
        vm.warp(deadline + 1);
        hub.orderFiller.reportExpired(orderId, _commitmentOf(r), deadline);

        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(HexOrderFiller.OrderPastDeadline.selector, deadline));
        hub.orderFiller.fill(orderId, deadline, r, plsUsdc, bot);
    }

    function test_once_lateMessageAfterReclaimIsIgnored() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId, uint256 amount) = _placeOrder(alice, r);
        _fill(orderId, r); // filled in time, but the bridge stalls...
        vm.warp(uint256(_deadline(orderId)) + RECLAIM_DELAY + 1);
        mirror.orderBook.reclaim(orderId);
        _relayToEthereum(); // ...and the settlement arrives after the buyer reclaimed

        assertEq(ethUsdc.balanceOf(alice), amount, "buyer has the refund");
        assertEq(ethUsdc.balanceOf(bot), 0, "the filler is not also paid");
    }

    function test_once_fillingTwiceFails() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        _fill(orderId, r);
        uint64 deadline = _deadline(orderId);
        vm.prank(bot);
        vm.expectRevert(
            abi.encodeWithSelector(
                HexOrderFiller.OrderClosed.selector, hub.orderFiller.orderKey(orderId, _commitmentOf(r), deadline)
            )
        );
        hub.orderFiller.fill(orderId, deadline, r, plsUsdc, bot);
    }

    function test_once_fillAfterDeadlineFails() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        uint64 deadline = _deadline(orderId);
        hub.registrar.commit(_commitmentOf(r));
        vm.warp(deadline + 1);
        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(HexOrderFiller.OrderPastDeadline.selector, deadline));
        hub.orderFiller.fill(orderId, deadline, r, plsUsdc, bot);
    }

    // ------------------------------------------------------------------------------------------
    // A filler cannot claim the wrong order
    // ------------------------------------------------------------------------------------------

    function test_claim_differentNameDoesNotPay() public {
        HexOrderFiller.Reveal memory wanted = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, wanted);

        // The filler registers some other name and claims alice's order with it.
        HexOrderFiller.Reveal memory other = _reveal("other", bot, ONE_YEAR);
        hub.registrar.commit(_commitmentOf(other));
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
        uint64 deadline = _deadline(orderId);
        vm.prank(bot);
        hub.orderFiller.fill(orderId, deadline, other, plsUsdc, bot);
        _relayToEthereum();

        assertEq(ethUsdc.balanceOf(bot), 0, "not paid");
        assertEq(uint8(_status(orderId)), uint8(HexOrderBook.Status.OPEN), "alice's order is untouched");
    }

    function test_claim_wrongDeadlineDoesNotPay() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        hub.registrar.commit(_commitmentOf(r));
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
        uint64 lateDeadline = _deadline(orderId) + 1 days; // a filler trying to buy itself more time
        vm.prank(bot);
        hub.orderFiller.fill(orderId, lateDeadline, r, plsUsdc, bot);
        _relayToEthereum();
        assertEq(ethUsdc.balanceOf(bot), 0);
        assertEq(uint8(_status(orderId)), uint8(HexOrderBook.Status.OPEN));
    }

    function test_claim_ownerIsBoundByTheCommitment() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        hub.registrar.commit(_commitmentOf(r));
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
        r.owner = bot; // try to register alice's name to the filler instead
        uint64 deadline = _deadline(orderId);
        vm.prank(bot);
        vm.expectRevert(); // no commitment exists for these details
        hub.orderFiller.fill(orderId, deadline, r, plsUsdc, bot);
    }

    // ------------------------------------------------------------------------------------------
    // Only PulseChain can settle
    // ------------------------------------------------------------------------------------------

    function test_auth_forgedSettlementRejected() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        bytes32 commitment = _commitmentOf(r);
        uint64 deadline = _deadline(orderId);
        bytes memory settle = abi.encodeCall(IHexOrderSettlement.settle, (orderId, commitment, deadline, bob, true));
        (bool ok,) = foreignAmb.deliverForged(address(mirror.orderBook), settle, bob, PULSECHAIN_CHAIN_ID);
        assertFalse(ok, "wrong sender");
        (ok,) = foreignAmb.deliverForged(address(mirror.orderBook), settle, address(hub.orderFiller), 1);
        assertFalse(ok, "wrong chain");
        vm.expectRevert(BridgeLink.NotFromPeer.selector);
        mirror.orderBook.settle(orderId, commitment, deadline, bob, true);
        assertEq(ethUsdc.balanceOf(bob), 0);
        assertEq(uint8(_status(orderId)), uint8(HexOrderBook.Status.OPEN));
    }

    // ------------------------------------------------------------------------------------------
    // Payouts that cannot be pushed
    // ------------------------------------------------------------------------------------------

    function test_payout_blockedPayeeCanWithdrawLater() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId, uint256 amount) = _placeOrder(alice, r);
        _fill(orderId, r);
        ethUsdc.setBlocked(bot, true);
        _relayToEthereum();
        assertEq(uint8(_status(orderId)), uint8(HexOrderBook.Status.FILLED), "the message still settles");
        assertEq(mirror.orderBook.owed(bot), amount);

        ethUsdc.setBlocked(bot, false);
        vm.prank(bot);
        mirror.orderBook.withdraw();
        assertEq(ethUsdc.balanceOf(bot), amount);
        assertEq(mirror.orderBook.owed(bot), 0);
    }

    function test_settlementMessage_hasEnoughGas() public {
        HexOrderFiller.Reveal memory r = _reveal("alice", alice, ONE_YEAR);
        (uint256 orderId,) = _placeOrder(alice, r);
        _fill(orderId, r);
        (bool ok,) = foreignAmb.deliver(homeAmb, 0);
        assertTrue(ok);
        assertLt(foreignAmb.lastGasUsed(), SETTLE_GAS / 2, "uses under half the gas it asks for");
    }
}
