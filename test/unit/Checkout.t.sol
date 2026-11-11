// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IETHRegistrar} from "@ensv2/registrar/interfaces/IETHRegistrar.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {Vm} from "forge-std/Vm.sol";

import {ZeroAddress} from "../../src/common/Errors.sol";
import {SwapPayments} from "../../src/common/SwapPayments.sol";
import {IHexMirrorSync} from "../../src/interfaces/IHexBridge.sol";
import {AnyTokenCheckout} from "../../src/pulsechain/AnyTokenCheckout.sol";
import {HexTestBase} from "../helpers/HexTestBase.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";
import {MockTaxedERC20} from "../mocks/MockTaxedERC20.sol";
import {ReentrantToken} from "../mocks/ReentrantToken.sol";

/// @notice Buying and renewing .hex names on PulseChain with any token, through the real registrar.
contract CheckoutTest is HexTestBase {
    uint256 internal constant HEX_RATE = 0.004e6 * 1e10; // set in HexTestBase: 1 HEX = $0.004
    uint256 internal constant WPLS_RATE = 0.00002e6; // 1 PLS = $0.00002
    uint256 internal constant TAXED_RATE = 0.01e6; // 1 TAX (18 decimals) = $0.01
    uint256 internal constant TAX_BPS = 500;
    uint256 internal constant FEE = 3e6; // a copy fee of $3
    uint256 internal constant MAX_FEE = 1000e6; // set at deploy: $1,000

    address internal copyBot = makeAddr("copyBot");

    AnyTokenCheckout internal checkout;
    MockTaxedERC20 internal taxed;
    MockSwapRouter internal otherRouter;

    function setUp() public override {
        super.setUp();
        checkout = hub.checkout;
        taxed = new MockTaxedERC20("Taxed", "TAX", 18, TAX_BPS);
        pulsex.setRate(address(taxed), address(plsUsdc), TAXED_RATE);
        otherRouter = new MockSwapRouter();
    }

    // ------------------------------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------------------------------

    function test_register_withUSDC() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price);
        vm.prank(alice);
        (uint256 tokenId, uint256 change) = checkout.registerWithToken(reg, plsUsdc, price, _noSwap());
        assertEq(change, 0);
        assertEq(hub.core.hexRegistry.ownerOf(tokenId), alice);
        assertEq(plsUsdc.balanceOf(beneficiary), price, "registrar paid exactly the price");
        _assertNothingLeft();
    }

    function test_register_aWalletHoldingExactlyTheShownPriceCanPay() public {
        // The app shows $10 for a year, and a wallet holding exactly 10 USDC can pay it.
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        _fundAndApprove(plsUsdc, alice, 10e6);
        vm.prank(alice);
        checkout.registerWithToken(reg, plsUsdc, 10e6, _noSwap());
        assertEq(hub.core.hexRegistry.findOwner("alice"), alice);
        assertEq(plsUsdc.balanceOf(alice), 0, "all 10 USDC, and no more");
        assertEq(plsUsdc.balanceOf(beneficiary), 10e6);
        _assertNothingLeft();
    }

    function test_register_withHEX_returnsChange() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        uint256 amountIn = _quote("alice", address(pHex)) * 102 / 100;
        uint256 got = amountIn * HEX_RATE / 1e18;
        _fundAndApprove(pHex, alice, amountIn);
        vm.prank(alice);
        (, uint256 change) =
            checkout.registerWithToken(reg, IERC20(address(pHex)), amountIn, _swap(address(pHex), price));
        assertEq(change, got - price);
        assertEq(plsUsdc.balanceOf(alice), change, "change in USDC");
        assertEq(plsUsdc.balanceOf(beneficiary), price);
        assertEq(hub.core.hexRegistry.findOwner("alice"), alice);
        _assertNothingLeft();
    }

    function test_register_asAGift() public {
        AnyTokenCheckout.Registration memory reg = _registration("forbob", bob);
        _commitReg(reg);
        uint256 price = _registerPrice("forbob", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price);
        vm.prank(alice);
        checkout.registerWithToken(reg, plsUsdc, price, _noSwap());
        assertEq(hub.core.hexRegistry.findOwner("forbob"), bob);
    }

    function test_register_withTaxedToken() public {
        AnyTokenCheckout.Registration memory reg = _registration("taxed", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("taxed", ONE_YEAR);
        // Taxed once into the checkout and again into the pool: add twice the tax, plus a margin.
        uint256 amountIn = _quote("taxed", address(taxed)) * (10_000 + 2 * TAX_BPS + 100) / 10_000;
        _fundAndApprove(taxed, alice, amountIn);
        vm.prank(alice);
        checkout.registerWithToken(reg, IERC20(address(taxed)), amountIn, _swap(address(taxed), price));
        assertEq(hub.core.hexRegistry.findOwner("taxed"), alice);
        assertEq(plsUsdc.balanceOf(beneficiary), price);
        _assertNothingLeft();
    }

    function test_register_withPLS() public {
        AnyTokenCheckout.Registration memory reg = _registration("plsname", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("plsname", ONE_YEAR);
        uint256 plsIn = _quote("plsname", address(wpls)) * 102 / 100;
        vm.deal(alice, plsIn);
        vm.prank(alice);
        (, uint256 change) = checkout.registerWithPLS{value: plsIn}(reg, _swap(address(wpls), price));
        assertEq(hub.core.hexRegistry.findOwner("plsname"), alice);
        assertEq(plsUsdc.balanceOf(alice), change);
        _assertNothingLeft();
    }

    function test_register_recentlyExpiredNameCostsAPremium() public {
        _registerDirect("lapsed", bob, 28 days);
        vm.warp(block.timestamp + 28 days + GRACE_PERIOD + 20 days); // 20 days into the 21-day premium
        uint256 base = 10e6; // a year of a 5+ letter name: exactly $10
        uint256 price = _registerPrice("lapsed", ONE_YEAR);
        assertGt(price, base + 40e6, "still a premium of about $47");

        AnyTokenCheckout.Registration memory reg = _registration("lapsed", alice);
        _commitReg(reg);
        price = _registerPrice("lapsed", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price);
        vm.prank(alice);
        checkout.registerWithToken(reg, plsUsdc, price, _noSwap());
        assertEq(hub.core.hexRegistry.findOwner("lapsed"), alice);

        vm.warp(block.timestamp + 2 days);
        assertEq(_registerPrice("other", ONE_YEAR), base, "no premium on a fresh name");
    }

    function test_register_sendsTheNameToEthereum() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price);
        vm.prank(alice);
        checkout.registerWithToken(reg, plsUsdc, price, _noSwap());
        assertEq(homeAmb.outboxLength(), 1, "a copy message was queued");
        _relayToEthereum();
        assertEq(mirror.core.hexRegistry.findOwner("alice"), alice);
    }

    // ------------------------------------------------------------------------------------------
    // Renewal
    // ------------------------------------------------------------------------------------------

    function test_renew_withToken() public {
        _registerDirect("alice", alice, ONE_YEAR);
        uint64 before = hub.core.hexRegistry.findExpiry("alice");
        uint256 price = hub.registrar.getRenewPrice("alice", ONE_YEAR, plsUsdc);
        (, uint256 amountIn) = checkout.quoteRenew("alice", ONE_YEAR, address(pulsex), _path(address(pHex)));
        amountIn = amountIn * 102 / 100;
        _fundAndApprove(pHex, bob, amountIn);
        vm.prank(bob); // anyone may renew any name
        checkout.renewWithToken(
            AnyTokenCheckout.Renewal("alice", ONE_YEAR, bytes32(0)),
            IERC20(address(pHex)),
            amountIn,
            _swap(address(pHex), price)
        );
        assertEq(hub.core.hexRegistry.findExpiry("alice"), before + ONE_YEAR);
        _relayToEthereum();
        assertEq(mirror.core.hexRegistry.findExpiry("alice"), before + ONE_YEAR, "copied to Ethereum");
        _assertNothingLeft();
    }

    function test_renew_withPLS() public {
        _registerDirect("alice", alice, ONE_YEAR);
        uint64 before = hub.core.hexRegistry.findExpiry("alice");
        uint256 price = hub.registrar.getRenewPrice("alice", ONE_YEAR, plsUsdc);
        (, uint256 plsIn) = checkout.quoteRenew("alice", ONE_YEAR, address(pulsex), _path(address(wpls)));
        plsIn = plsIn * 102 / 100;
        vm.deal(bob, plsIn);
        vm.prank(bob);
        checkout.renewWithPLS{value: plsIn}(
            AnyTokenCheckout.Renewal("alice", ONE_YEAR, bytes32(0)), _swap(address(wpls), price)
        );
        assertEq(hub.core.hexRegistry.findExpiry("alice"), before + ONE_YEAR);
    }

    // ------------------------------------------------------------------------------------------
    // Rejections
    // ------------------------------------------------------------------------------------------

    function test_revert_routerNotAllowed() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        SwapPayments.Swap memory s = _swap(address(pHex), 0);
        s.router = address(otherRouter);
        vm.expectRevert(abi.encodeWithSelector(SwapPayments.RouterNotAllowed.selector, address(otherRouter)));
        checkout.registerWithToken(reg, IERC20(address(pHex)), 1, s);
    }

    function test_revert_badPaths() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        SwapPayments.Swap memory s = _swap(address(pHex), 0);
        s.path[0] = address(wpls); // does not start with the input token
        vm.expectRevert(SwapPayments.InvalidPath.selector);
        checkout.registerWithToken(reg, IERC20(address(pHex)), 1, s);

        s = _swap(address(pHex), 0);
        s.path[1] = address(plsDai); // does not end with the payment token
        vm.expectRevert(SwapPayments.InvalidPath.selector);
        checkout.registerWithToken(reg, IERC20(address(pHex)), 1, s);

        s.path = new address[](1); // too short
        s.path[0] = address(pHex);
        vm.expectRevert(SwapPayments.InvalidPath.selector);
        checkout.registerWithToken(reg, IERC20(address(pHex)), 1, s);

        s = _swap(address(plsUsdc), 0); // the payment token itself needs no path
        vm.expectRevert(SwapPayments.InvalidPath.selector);
        checkout.registerWithToken(reg, plsUsdc, 1, s);

        vm.expectRevert(SwapPayments.InvalidPath.selector); // PLS path must start with WPLS
        checkout.registerWithPLS{value: 1}(reg, _swap(address(pHex), 0));
    }

    function test_revert_noPLSSent() public {
        vm.expectRevert(SwapPayments.NoValue.selector);
        checkout.registerWithPLS(_registration("alice", alice), _swap(address(wpls), 0));
    }

    function test_revert_swapBelowMinimum() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        uint256 amountIn = _quote("alice", address(pHex));
        _fundAndApprove(pHex, alice, amountIn);
        vm.prank(alice);
        vm.expectRevert("MockSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        checkout.registerWithToken(reg, IERC20(address(pHex)), amountIn, _swap(address(pHex), price * 2));
    }

    function test_revert_paymentShortOfThePrice() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SwapPayments.InsufficientPayment.selector, price - 1, price));
        checkout.registerWithToken(reg, plsUsdc, price - 1, _noSwap());
    }

    function test_revert_notCommitted() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price);
        vm.prank(alice);
        vm.expectRevert(); // CommitmentTooOld: the registrar has no commitment for it
        checkout.registerWithToken(reg, plsUsdc, price, _noSwap());
    }

    function test_revert_tokenReentersCheckout() public {
        ReentrantToken bad = new ReentrantToken();
        pulsex.setRate(address(bad), address(plsUsdc), 1e6);
        bad.mint(alice, 1e18);
        bad.arm(checkout);
        vm.startPrank(alice);
        bad.approve(address(checkout), 1e18);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        checkout.renewWithToken(
            AnyTokenCheckout.Renewal("alice", ONE_YEAR, bytes32(0)), IERC20(address(bad)), 1e18, _swap(address(bad), 0)
        );
        vm.stopPrank();
    }

    function test_revert_constructedWithZeroAddress() public {
        address[] memory routers = new address[](0);
        vm.expectRevert(ZeroAddress.selector);
        new AnyTokenCheckout(
            IETHRegistrar(address(0)),
            plsUsdc,
            IERC20(address(wpls)),
            routers,
            IHexMirrorSync(address(0)),
            admin,
            address(0),
            MAX_FEE
        );
        vm.expectRevert(ZeroAddress.selector);
        new AnyTokenCheckout(
            hub.registrar,
            IERC20(address(0)),
            IERC20(address(wpls)),
            routers,
            IHexMirrorSync(address(0)),
            admin,
            address(0),
            MAX_FEE
        );
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new AnyTokenCheckout(
            hub.registrar,
            plsUsdc,
            IERC20(address(wpls)),
            routers,
            IHexMirrorSync(address(0)),
            address(0),
            address(0),
            MAX_FEE
        );
    }

    // ------------------------------------------------------------------------------------------
    // Accounting
    // ------------------------------------------------------------------------------------------

    function test_strayBalancesAreNeverPaidOut() public {
        plsUsdc.mint(address(checkout), 100e6); // someone sends USDC here by mistake
        AnyTokenCheckout.Registration memory reg = _registration("stray", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("stray", ONE_YEAR);
        uint256 amountIn = _quote("stray", address(pHex)) * 102 / 100;
        uint256 got = amountIn * HEX_RATE / 1e18;
        _fundAndApprove(pHex, alice, amountIn);
        vm.prank(alice);
        (, uint256 change) =
            checkout.registerWithToken(reg, IERC20(address(pHex)), amountIn, _swap(address(pHex), price));
        assertEq(change, got - price, "change excludes the stray USDC");
        assertEq(plsUsdc.balanceOf(address(checkout)), 100e6, "stray USDC stays where it is");
    }

    function testFuzz_register_accounting(uint256 amountIn, uint64 duration) public {
        duration = uint64(bound(duration, MIN_REGISTER_DURATION, 5 * ONE_YEAR)); // the longest a name can be paid for
        AnyTokenCheckout.Registration memory reg = _registration("fuzzed", alice);
        reg.duration = duration;
        _commitReg(reg);
        uint256 price = _registerPrice("fuzzed", duration);
        uint256 minIn = (price * 1e18 + HEX_RATE - 1) / HEX_RATE;
        amountIn = bound(amountIn, minIn, minIn * 1000);
        uint256 got = amountIn * HEX_RATE / 1e18;
        _fundAndApprove(pHex, alice, amountIn);
        vm.prank(alice);
        (, uint256 change) = checkout.registerWithToken(reg, IERC20(address(pHex)), amountIn, _swap(address(pHex), 0));
        assertEq(plsUsdc.balanceOf(beneficiary), price, "registrar paid exactly the price");
        assertEq(change, got - price);
        assertEq(plsUsdc.balanceOf(alice), change);
        _assertNothingLeft();
    }

    // ------------------------------------------------------------------------------------------
    // The copy fee: paying to have a name copied to Ethereum at once, while Ethereum is busy
    // ------------------------------------------------------------------------------------------

    function test_copyFee_isOffUntilTheAdminChoosesTheBot() public {
        assertEq(checkout.owner(), admin);
        assertEq(checkout.copyBot(), address(0));
        assertEq(checkout.maxCopyFee(), MAX_FEE, "at most $1,000");
        assertEq(checkout.copyFee(), 0);
        vm.expectRevert(AnyTokenCheckout.NotCopyBot.selector);
        checkout.setCopyFee(FEE);
    }

    function test_copyFee_onlyTheAdminChoosesTheBotAndTheCap() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        checkout.setCopyBot(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        checkout.setMaxCopyFee(1e12);
        vm.stopPrank();

        vm.startPrank(admin);
        vm.expectEmit(address(checkout));
        emit AnyTokenCheckout.CopyBotSet(copyBot);
        checkout.setCopyBot(copyBot);
        vm.expectEmit(address(checkout));
        emit AnyTokenCheckout.MaxCopyFeeSet(20e6);
        checkout.setMaxCopyFee(20e6);
        vm.stopPrank();
        assertEq(checkout.copyBot(), copyBot);
        assertEq(checkout.maxCopyFee(), 20e6);
    }

    function test_copyFee_onlyTheBotSetsIt_andTheAdminCanSwitchItOff() public {
        vm.prank(admin);
        checkout.setCopyBot(copyBot);
        vm.prank(alice);
        vm.expectRevert(AnyTokenCheckout.NotCopyBot.selector);
        checkout.setCopyFee(FEE);
        vm.expectRevert(AnyTokenCheckout.NotCopyBot.selector);
        vm.prank(admin);
        checkout.setCopyFee(FEE);

        vm.expectEmit(address(checkout));
        emit AnyTokenCheckout.CopyFeeSet(FEE);
        vm.prank(copyBot);
        checkout.setCopyFee(FEE);
        assertEq(checkout.copyFee(), FEE);

        // A cap of zero switches it off, and so does choosing no bot.
        vm.prank(admin);
        checkout.setMaxCopyFee(0);
        assertEq(checkout.copyFee(), 0);
        vm.prank(admin);
        checkout.setMaxCopyFee(MAX_FEE);
        assertEq(checkout.copyFee(), FEE);
        vm.prank(admin);
        checkout.setCopyBot(address(0));
        assertEq(checkout.copyFee(), 0);
        // A new bot starts from no fee.
        vm.prank(admin);
        checkout.setCopyBot(copyBot);
        assertEq(checkout.copyFee(), 0);
    }

    function test_copyFee_settingsAreFixedOnceTheAdminGivesThemUp() public {
        _turnOnCopyFee(FEE);
        vm.prank(admin);
        checkout.renounceOwnership();
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, admin));
        checkout.setMaxCopyFee(0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, admin));
        checkout.setCopyBot(admin);
        vm.stopPrank();
        vm.prank(copyBot);
        checkout.setCopyFee(FEE * 2); // the bot still keeps the fee up to date
        assertEq(checkout.copyFee(), FEE * 2);
    }

    function test_registerAndCopy_paysTheFeeToTheBot() public {
        _turnOnCopyFee(FEE);
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        (uint256 price, uint256 fee, uint256 amountIn) =
            checkout.quoteRegisterAndCopy("alice", ONE_YEAR, address(0), new address[](0));
        assertEq(price, 10e6);
        assertEq(fee, FEE);
        assertEq(amountIn, price + FEE, "the price and the fee, in USDC");
        _fundAndApprove(plsUsdc, alice, amountIn);
        uint256 messageId = homeAmb.outboxLength();

        vm.expectEmit(address(checkout));
        emit AnyTokenCheckout.CopyPaid("alice", alice, FEE, bytes32(messageId));
        vm.prank(alice);
        (, uint256 change, uint256 charged) = checkout.registerWithTokenAndCopy(reg, plsUsdc, amountIn, _noSwap(), FEE);
        assertEq(charged, FEE);
        assertEq(change, 0);
        assertEq(plsUsdc.balanceOf(alice), 0);
        assertEq(plsUsdc.balanceOf(beneficiary), price, "the registrar was paid exactly the price");
        assertEq(plsUsdc.balanceOf(copyBot), FEE, "the fee went to the bot");
        assertEq(hub.core.hexRegistry.findOwner("alice"), alice);
        assertEq(homeAmb.outboxLength(), messageId + 1, "one copy went out");
        _relayToEthereum();
        assertEq(mirror.core.hexRegistry.findOwner("alice"), alice);
        _assertNothingLeft();
    }

    function test_registerAndCopy_withHEX() public {
        _turnOnCopyFee(FEE);
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        (uint256 price,, uint256 amountIn) =
            checkout.quoteRegisterAndCopy("alice", ONE_YEAR, address(pulsex), _path(address(pHex)));
        amountIn = amountIn * 102 / 100;
        uint256 got = amountIn * HEX_RATE / 1e18;
        _fundAndApprove(pHex, alice, amountIn);
        vm.prank(alice);
        (, uint256 change, uint256 fee) = checkout.registerWithTokenAndCopy(
            reg, IERC20(address(pHex)), amountIn, _swap(address(pHex), price + FEE), FEE
        );
        assertEq(fee, FEE);
        assertEq(change, got - price - FEE);
        assertEq(plsUsdc.balanceOf(alice), change, "change in USDC");
        assertEq(plsUsdc.balanceOf(copyBot), FEE);
        assertEq(plsUsdc.balanceOf(beneficiary), price);
        _assertNothingLeft();
    }

    function test_registerAndCopy_withPLS() public {
        _turnOnCopyFee(FEE);
        AnyTokenCheckout.Registration memory reg = _registration("plsname", alice);
        _commitReg(reg);
        (uint256 price,, uint256 plsIn) =
            checkout.quoteRegisterAndCopy("plsname", ONE_YEAR, address(pulsex), _path(address(wpls)));
        plsIn = plsIn * 102 / 100;
        vm.deal(alice, plsIn);
        vm.prank(alice);
        (, uint256 change, uint256 fee) =
            checkout.registerWithPLSAndCopy{value: plsIn}(reg, _swap(address(wpls), price + FEE), FEE);
        assertEq(fee, FEE);
        assertEq(hub.core.hexRegistry.findOwner("plsname"), alice);
        assertEq(plsUsdc.balanceOf(copyBot), FEE);
        assertEq(plsUsdc.balanceOf(alice), change, "change in USDC");
        assertEq(plsUsdc.balanceOf(beneficiary), price);
        _assertNothingLeft();
    }

    function test_registerAndCopy_isAPlainPurchaseWhenCopiesAreFree() public {
        vm.prank(admin);
        checkout.setCopyBot(copyBot); // the bot runs, and Ethereum isn't busy: no fee
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        (uint256 price, uint256 fee, uint256 amountIn) =
            checkout.quoteRegisterAndCopy("alice", ONE_YEAR, address(0), new address[](0));
        assertEq(fee, 0);
        assertEq(amountIn, price);
        _fundAndApprove(plsUsdc, alice, price + FEE);
        vm.recordLogs();
        vm.prank(alice);
        (, uint256 change, uint256 charged) =
            checkout.registerWithTokenAndCopy(reg, plsUsdc, price + FEE, _noSwap(), FEE);
        assertEq(charged, 0);
        assertEq(change, FEE, "anything over the price comes back");
        _assertNoCopyPaid();
        assertEq(homeAmb.outboxLength(), 1, "the copy went out, free");
        _assertNothingLeft();
    }

    function test_registerAndCopy_aFeeRaisedAboveTheBuyersLimitIsNotCharged() public {
        _turnOnCopyFee(FEE);
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price + 2 * FEE);
        vm.prank(copyBot);
        checkout.setCopyFee(FEE + 1); // gas rose after the buyer's quote
        vm.recordLogs();
        vm.prank(alice);
        (, uint256 change, uint256 fee) =
            checkout.registerWithTokenAndCopy(reg, plsUsdc, price + 2 * FEE, _noSwap(), FEE);
        assertEq(fee, 0);
        assertEq(change, 2 * FEE, "everything over the price comes back");
        assertEq(plsUsdc.balanceOf(copyBot), 0);
        assertEq(hub.core.hexRegistry.findOwner("alice"), alice, "the purchase still went through");
        assertEq(homeAmb.outboxLength(), 1, "and the copy went out, unpaid");
        _assertNoCopyPaid();
        _assertNothingLeft();
    }

    function test_registerAndCopy_aFeeAboveWhatIsLeftOfThePaymentIsNotCharged() public {
        _turnOnCopyFee(FEE);
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price + FEE - 1);
        vm.prank(alice);
        (, uint256 change, uint256 fee) =
            checkout.registerWithTokenAndCopy(reg, plsUsdc, price + FEE - 1, _noSwap(), FEE);
        assertEq(fee, 0);
        assertEq(change, FEE - 1);
        assertEq(hub.core.hexRegistry.findOwner("alice"), alice);
        _assertNothingLeft();
    }

    function test_registerAndCopy_aHighFeeCanStillBePaid() public {
        // Ethereum is extremely busy (200 gwei): copying at once costs $155.31, and a buyer may pay it.
        uint256 high = 155_310_000;
        _turnOnCopyFee(high);
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        (uint256 price, uint256 fee, uint256 amountIn) =
            checkout.quoteRegisterAndCopy("alice", ONE_YEAR, address(0), new address[](0));
        assertEq(fee, high);
        _fundAndApprove(plsUsdc, alice, amountIn);
        vm.prank(alice);
        (,, uint256 charged) = checkout.registerWithTokenAndCopy(reg, plsUsdc, amountIn, _noSwap(), high);
        assertEq(charged, high);
        assertEq(plsUsdc.balanceOf(copyBot), high);
        assertEq(plsUsdc.balanceOf(beneficiary), price);
        _assertNothingLeft();
    }

    function test_copyFee_theBotCanSayCopyingAtOnceIsUnavailable() public {
        // The bot hasn't the ETH to copy at once just now: it sets the most there is, so nothing is
        // offered, and nobody pays for a copy it couldn't make straight away.
        _turnOnCopyFee(type(uint256).max);
        (, uint256 fee,) = checkout.quoteRegisterAndCopy("alice", ONE_YEAR, address(0), new address[](0));
        assertEq(fee, 0);
        (fee,) = checkout.quoteCopyFee(address(0), new address[](0));
        assertEq(fee, 0);
        _registerDirect("alice", alice, ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(AnyTokenCheckout.NoCopyFee.selector);
        checkout.payCopyFee("alice", plsUsdc, 10e6, _noSwap());
    }

    function test_registerAndCopy_aFeeAboveTheCapIsNotOffered() public {
        // Ethereum is so busy the copy would cost more than the cap: copying at once isn't offered.
        _turnOnCopyFee(MAX_FEE + 1);
        assertEq(checkout.copyFee(), MAX_FEE + 1, "the website can tell");
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        (uint256 price, uint256 fee, uint256 amountIn) =
            checkout.quoteRegisterAndCopy("alice", ONE_YEAR, address(0), new address[](0));
        assertEq(fee, 0);
        assertEq(amountIn, price);
        (fee, amountIn) = checkout.quoteCopyFee(address(0), new address[](0));
        assertEq(fee, 0);
        assertEq(amountIn, 0);

        _fundAndApprove(plsUsdc, alice, price + MAX_FEE + 1);
        vm.prank(alice);
        uint256 change;
        (, change, fee) =
            checkout.registerWithTokenAndCopy(reg, plsUsdc, price + MAX_FEE + 1, _noSwap(), type(uint256).max);
        assertEq(fee, 0);
        assertEq(change, MAX_FEE + 1);
        assertEq(plsUsdc.balanceOf(copyBot), 0);
        _assertNothingLeft();
    }

    function test_registerAndCopy_nothingIsChargedIfTheCopyFails() public {
        _turnOnCopyFee(FEE);
        vm.mockCallRevert(address(hub.mirrorSync), abi.encodeWithSelector(IHexMirrorSync.sync.selector), "bridge down");
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price + FEE);
        vm.recordLogs();
        vm.prank(alice);
        (, uint256 change, uint256 fee) = checkout.registerWithTokenAndCopy(reg, plsUsdc, price + FEE, _noSwap(), FEE);
        assertEq(fee, 0);
        assertEq(change, FEE);
        assertEq(hub.core.hexRegistry.findOwner("alice"), alice, "the purchase still went through");
        _assertNoCopyPaid();
        _assertNothingLeft();
    }

    function test_renewAndCopy_withToken() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _turnOnCopyFee(FEE);
        uint64 before = hub.core.hexRegistry.findExpiry("alice");
        (uint256 price, uint256 fee, uint256 amountIn) =
            checkout.quoteRenewAndCopy("alice", ONE_YEAR, address(pulsex), _path(address(pHex)));
        assertEq(fee, FEE);
        amountIn = amountIn * 102 / 100;
        _fundAndApprove(pHex, bob, amountIn);
        uint256 messageId = homeAmb.outboxLength();
        vm.expectEmit(address(checkout));
        emit AnyTokenCheckout.CopyPaid("alice", bob, FEE, bytes32(messageId));
        vm.prank(bob); // anyone may renew any name, and pay to copy it
        (, uint256 charged) = checkout.renewWithTokenAndCopy(
            AnyTokenCheckout.Renewal("alice", ONE_YEAR, bytes32(0)),
            IERC20(address(pHex)),
            amountIn,
            _swap(address(pHex), price + FEE),
            FEE
        );
        assertEq(charged, FEE);
        assertEq(plsUsdc.balanceOf(copyBot), FEE);
        assertEq(plsUsdc.balanceOf(beneficiary), 2 * price, "the purchase and the renewal");
        assertEq(hub.core.hexRegistry.findExpiry("alice"), before + ONE_YEAR);
        _relayToEthereum();
        assertEq(mirror.core.hexRegistry.findExpiry("alice"), before + ONE_YEAR, "copied to Ethereum");
        _assertNothingLeft();
    }

    function test_renewAndCopy_withPLS() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _turnOnCopyFee(FEE);
        uint64 before = hub.core.hexRegistry.findExpiry("alice");
        (uint256 price,, uint256 plsIn) =
            checkout.quoteRenewAndCopy("alice", ONE_YEAR, address(pulsex), _path(address(wpls)));
        plsIn = plsIn * 102 / 100;
        vm.deal(bob, plsIn);
        vm.prank(bob);
        (uint256 change, uint256 fee) = checkout.renewWithPLSAndCopy{value: plsIn}(
            AnyTokenCheckout.Renewal("alice", ONE_YEAR, bytes32(0)), _swap(address(wpls), price + FEE), FEE
        );
        assertEq(fee, FEE);
        assertEq(plsUsdc.balanceOf(copyBot), FEE);
        assertEq(plsUsdc.balanceOf(bob), change);
        assertEq(hub.core.hexRegistry.findExpiry("alice"), before + ONE_YEAR);
        _assertNothingLeft();
    }

    function test_oldFunctionsNeverChargeTheFee() public {
        _turnOnCopyFee(FEE);
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price + FEE);
        vm.recordLogs();
        vm.prank(alice);
        (, uint256 change) = checkout.registerWithToken(reg, plsUsdc, price + FEE, _noSwap());
        assertEq(change, FEE);

        uint256 renewal = hub.registrar.getRenewPrice("alice", ONE_YEAR, plsUsdc);
        _fundAndApprove(plsUsdc, alice, renewal + FEE);
        vm.prank(alice);
        change = checkout.renewWithToken(
            AnyTokenCheckout.Renewal("alice", ONE_YEAR, bytes32(0)), plsUsdc, renewal + FEE, _noSwap()
        );
        assertEq(change, FEE);
        assertEq(plsUsdc.balanceOf(copyBot), 0);
        assertEq(homeAmb.outboxLength(), 2, "both copies went out, unpaid");
        _assertNoCopyPaid();
        _assertNothingLeft();
    }

    function test_payCopyFee_afterSendingAName() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        hub.mirrorSync.sync("alice");
        _relayToEthereum();
        assertEq(mirror.core.hexRegistry.findOwner("alice"), alice);

        // Ethereum is busy. Alice sends the name to Bob, and pays to have Ethereum follow at once.
        vm.prank(alice);
        hub.core.hexRegistry.safeTransferFrom(alice, bob, tokenId, 1, "");
        _turnOnCopyFee(FEE);
        (uint256 fee, uint256 amountIn) = checkout.quoteCopyFee(address(0), new address[](0));
        assertEq(fee, FEE);
        assertEq(amountIn, FEE);
        _fundAndApprove(plsUsdc, alice, FEE);
        uint256 messageId = homeAmb.outboxLength();
        vm.expectEmit(address(checkout));
        emit AnyTokenCheckout.CopyPaid("alice", alice, FEE, bytes32(messageId));
        vm.prank(alice);
        uint256 change;
        (fee, change) = checkout.payCopyFee("alice", plsUsdc, FEE, _noSwap());
        assertEq(fee, FEE);
        assertEq(change, 0);
        assertEq(plsUsdc.balanceOf(copyBot), FEE);
        assertEq(homeAmb.outboxLength(), messageId + 1);
        _relayToEthereum();
        assertEq(mirror.core.hexRegistry.findOwner("alice"), bob, "Ethereum shows the new owner");
        _assertNothingLeft();
    }

    function test_payCopyFee_withPLS() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _turnOnCopyFee(FEE);
        (uint256 fee, uint256 plsIn) = checkout.quoteCopyFee(address(pulsex), _path(address(wpls)));
        assertEq(fee, FEE);
        plsIn = plsIn * 102 / 100;
        uint256 got = plsIn * WPLS_RATE / 1e18;
        vm.deal(alice, plsIn);
        vm.prank(alice);
        uint256 change;
        (fee, change) = checkout.payCopyFeeWithPLS{value: plsIn}("alice", _swap(address(wpls), FEE));
        assertEq(fee, FEE);
        assertEq(change, got - FEE);
        assertEq(plsUsdc.balanceOf(copyBot), FEE);
        assertEq(plsUsdc.balanceOf(alice), change, "change in USDC");
        _assertNothingLeft();
    }

    function test_revert_payCopyFee_whenThereIsNoFeeToPay() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, FEE);
        vm.startPrank(alice);
        vm.expectRevert(AnyTokenCheckout.NoCopyFee.selector); // the fee is off
        checkout.payCopyFee("alice", plsUsdc, FEE, _noSwap());
        vm.stopPrank();

        _turnOnCopyFee(0); // copies are cheap: free
        vm.prank(alice);
        vm.expectRevert(AnyTokenCheckout.NoCopyFee.selector);
        checkout.payCopyFee("alice", plsUsdc, FEE, _noSwap());

        vm.prank(copyBot);
        checkout.setCopyFee(MAX_FEE + 1); // too dear to offer
        vm.deal(alice, 1e18);
        vm.prank(alice);
        vm.expectRevert(AnyTokenCheckout.NoCopyFee.selector);
        checkout.payCopyFeeWithPLS{value: 1e18}("alice", _swap(address(wpls), 0));
    }

    function test_revert_payCopyFee_whenThePaymentFallsShort() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _turnOnCopyFee(FEE);
        _fundAndApprove(plsUsdc, alice, FEE);
        vm.prank(copyBot);
        checkout.setCopyFee(FEE + 1); // gas rose after the quote
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SwapPayments.InsufficientPayment.selector, FEE, FEE + 1));
        checkout.payCopyFee("alice", plsUsdc, FEE, _noSwap());
    }

    function test_revert_payCopyFee_whenTheCopyFails() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _turnOnCopyFee(FEE);
        vm.mockCallRevert(address(hub.mirrorSync), abi.encodeWithSelector(IHexMirrorSync.sync.selector), "bridge down");
        _fundAndApprove(plsUsdc, alice, FEE);
        vm.prank(alice);
        vm.expectRevert(AnyTokenCheckout.CopyFailed.selector);
        checkout.payCopyFee("alice", plsUsdc, FEE, _noSwap());
    }

    function test_revert_tokenReentersPayCopyFee() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _turnOnCopyFee(FEE);
        ReentrantToken bad = new ReentrantToken();
        pulsex.setRate(address(bad), address(plsUsdc), 1e6);
        bad.mint(alice, 1e18);
        bad.arm(checkout);
        vm.startPrank(alice);
        bad.approve(address(checkout), 1e18);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        checkout.payCopyFee("alice", IERC20(address(bad)), 1e18, _swap(address(bad), 0));
        vm.stopPrank();
    }

    function test_quotes_withTheCopyFee() public {
        _turnOnCopyFee(FEE);
        (uint256 price, uint256 amountIn) =
            checkout.quoteRegister("alice", ONE_YEAR, address(pulsex), _path(address(pHex)));
        (uint256 price2, uint256 fee, uint256 bothIn) =
            checkout.quoteRegisterAndCopy("alice", ONE_YEAR, address(pulsex), _path(address(pHex)));
        (, uint256 feeIn) = checkout.quoteCopyFee(address(pulsex), _path(address(pHex)));
        assertEq(price2, price);
        assertEq(fee, FEE);
        assertApproxEqAbs(bothIn, amountIn + feeIn, 2, "the price's and the fee's amounts together");

        vm.prank(copyBot);
        checkout.setCopyFee(0);
        (, fee, bothIn) = checkout.quoteRegisterAndCopy("alice", ONE_YEAR, address(pulsex), _path(address(pHex)));
        assertEq(fee, 0);
        assertEq(bothIn, amountIn, "with no fee, the same as without the copy");
        (fee, feeIn) = checkout.quoteCopyFee(address(pulsex), _path(address(pHex)));
        assertEq(fee, 0);
        assertEq(feeIn, 0);
    }

    function testFuzz_registerAndCopy_accounting(uint256 fee, uint256 limit, uint256 extra) public {
        fee = bound(fee, 0, 2 * MAX_FEE);
        limit = bound(limit, 0, 2 * MAX_FEE);
        extra = bound(extra, 0, 2 * MAX_FEE);
        _turnOnCopyFee(fee);
        AnyTokenCheckout.Registration memory reg = _registration("fuzzed", alice);
        _commitReg(reg);
        uint256 price = _registerPrice("fuzzed", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price + extra);
        vm.prank(alice);
        (, uint256 change, uint256 charged) =
            checkout.registerWithTokenAndCopy(reg, plsUsdc, price + extra, _noSwap(), limit);
        bool due = fee != 0 && fee <= MAX_FEE && fee <= limit && fee <= extra;
        assertEq(charged, due ? fee : 0);
        assertEq(plsUsdc.balanceOf(copyBot), charged);
        assertEq(change, extra - charged);
        assertEq(plsUsdc.balanceOf(alice), change);
        assertEq(plsUsdc.balanceOf(beneficiary), price, "the registrar was paid exactly the price");
        assertEq(hub.core.hexRegistry.findOwner("fuzzed"), alice);
        _assertNothingLeft();
    }

    // ------------------------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------------------------

    function _registration(string memory label, address owner)
        internal
        pure
        returns (AnyTokenCheckout.Registration memory)
    {
        return AnyTokenCheckout.Registration({
            label: label,
            owner: owner,
            secret: keccak256(bytes(label)),
            subregistry: IRegistry(address(0)),
            resolver: address(0),
            duration: ONE_YEAR,
            referrer: bytes32(0)
        });
    }

    function _commitReg(AnyTokenCheckout.Registration memory reg) internal {
        hub.registrar
            .commit(
                hub.registrar
                    .makeCommitment(
                        reg.label, reg.owner, reg.secret, reg.subregistry, reg.resolver, reg.duration, reg.referrer
                    )
            );
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
    }

    function _registerPrice(string memory label, uint64 duration) internal view returns (uint256) {
        (uint256 base, uint256 premium) = hub.registrar.getRegisterPrice(label, duration, plsUsdc);
        return base + premium;
    }

    function _quote(string memory label, address tokenIn) internal view returns (uint256 amountIn) {
        (, amountIn) = checkout.quoteRegister(label, ONE_YEAR, address(pulsex), _path(tokenIn));
    }

    function _path(address tokenIn) internal view returns (address[] memory path) {
        path = new address[](2);
        path[0] = tokenIn;
        path[1] = address(plsUsdc);
    }

    function _swap(address tokenIn, uint256 amountOutMin) internal view returns (SwapPayments.Swap memory) {
        return SwapPayments.Swap({
            router: address(pulsex),
            path: _path(tokenIn),
            amountOutMin: amountOutMin,
            deadline: block.timestamp + 1 hours
        });
    }

    function _fundAndApprove(MockERC20 token, address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(checkout), amount);
    }

    function _turnOnCopyFee(uint256 fee) internal {
        vm.prank(admin);
        checkout.setCopyBot(copyBot);
        vm.prank(copyBot);
        checkout.setCopyFee(fee);
    }

    function _assertNoCopyPaid() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter == address(checkout)) {
                assertTrue(logs[i].topics[0] != AnyTokenCheckout.CopyPaid.selector, "no copy fee was charged");
            }
        }
    }

    function _assertNothingLeft() internal view {
        assertEq(plsUsdc.balanceOf(address(checkout)), 0, "no USDC left");
        assertEq(pHex.balanceOf(address(checkout)), 0, "no HEX left");
        assertEq(taxed.balanceOf(address(checkout)), 0, "no taxed token left");
        assertEq(wpls.balanceOf(address(checkout)), 0, "no WPLS left");
        assertEq(address(checkout).balance, 0, "no PLS left");
        assertEq(plsUsdc.allowance(address(checkout), address(hub.registrar)), 0, "no registrar allowance left");
        assertEq(pHex.allowance(address(checkout), address(pulsex)), 0, "no router allowance left");
        assertEq(wpls.allowance(address(checkout), address(pulsex)), 0, "no WPLS allowance left");
    }
}
