// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IETHRegistrar} from "@ensv2/registrar/interfaces/IETHRegistrar.sol";

import {AnyTokenCheckout} from "../../src/AnyTokenCheckout.sol";
import {ZeroAddress} from "../../src/Errors.sol";
import {SwapPayments} from "../../src/SwapPayments.sol";
import {PdaiTestBase} from "../helpers/PdaiTestBase.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";
import {MockTaxedERC20} from "../mocks/MockTaxedERC20.sol";
import {ReentrantToken} from "../mocks/ReentrantToken.sol";

/// @notice Buying and renewing .pdai names on PulseChain with any token, through the real registrar.
contract CheckoutTest is PdaiTestBase {
    uint256 internal constant HEX_RATE = 0.004e6 * 1e10; // set in PdaiTestBase: 1 HEX = $0.004
    uint256 internal constant WPLS_RATE = 0.00002e6; // 1 PLS = $0.00002
    uint256 internal constant TAXED_RATE = 0.01e6; // 1 TAX (18 decimals) = $0.01
    uint256 internal constant TAX_BPS = 500;

    AnyTokenCheckout internal checkout;
    MockTaxedERC20 internal taxed;
    MockSwapRouter internal otherRouter;

    function setUp() public override {
        super.setUp();
        checkout = deployed.checkout;
        taxed = new MockTaxedERC20("Taxed", "TAX", 18, TAX_BPS);
        pulsex.setRate(address(taxed), address(plsUsdc), TAXED_RATE);
        otherRouter = new MockSwapRouter();
    }

    // ------------------------------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------------------------------

    function test_register_withUSDC() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice, ONE_YEAR);
        _commit(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price);
        vm.prank(alice);
        (uint256 tokenId, uint256 change) = checkout.registerWithToken(reg, plsUsdc, price, _noSwap());
        assertEq(change, 0);
        assertEq(deployed.pdaiRegistry.ownerOf(tokenId), alice);
        assertEq(plsUsdc.balanceOf(beneficiary), price, "registrar paid exactly the price");
        _assertNothingLeft();
    }

    function test_register_aWalletHoldingExactlyTheShownPriceCanPay() public {
        // The app shows $10 for a year, and a wallet holding exactly 10 USDC can pay it.
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice, ONE_YEAR);
        _commit(reg);
        _fundAndApprove(plsUsdc, alice, 10e6);
        vm.prank(alice);
        checkout.registerWithToken(reg, plsUsdc, 10e6, _noSwap());
        assertEq(deployed.pdaiRegistry.findOwner("alice"), alice);
        assertEq(plsUsdc.balanceOf(alice), 0, "all 10 USDC, and no more");
        assertEq(plsUsdc.balanceOf(beneficiary), 10e6);
        _assertNothingLeft();
    }

    function test_register_withHEX_returnsChange() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice, ONE_YEAR);
        _commit(reg);
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
        assertEq(deployed.pdaiRegistry.findOwner("alice"), alice);
        _assertNothingLeft();
    }

    function test_register_asAGift() public {
        AnyTokenCheckout.Registration memory reg = _registration("forbob", bob, ONE_YEAR);
        _commit(reg);
        uint256 price = _registerPrice("forbob", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price);
        vm.prank(alice);
        checkout.registerWithToken(reg, plsUsdc, price, _noSwap());
        assertEq(deployed.pdaiRegistry.findOwner("forbob"), bob);
    }

    function test_register_withTaxedToken() public {
        AnyTokenCheckout.Registration memory reg = _registration("taxed", alice, ONE_YEAR);
        _commit(reg);
        uint256 price = _registerPrice("taxed", ONE_YEAR);
        // Taxed once into the checkout and again into the pool: add twice the tax, plus a margin.
        uint256 amountIn = _quote("taxed", address(taxed)) * (10_000 + 2 * TAX_BPS + 100) / 10_000;
        _fundAndApprove(taxed, alice, amountIn);
        vm.prank(alice);
        checkout.registerWithToken(reg, IERC20(address(taxed)), amountIn, _swap(address(taxed), price));
        assertEq(deployed.pdaiRegistry.findOwner("taxed"), alice);
        assertEq(plsUsdc.balanceOf(beneficiary), price);
        _assertNothingLeft();
    }

    function test_register_withPLS() public {
        AnyTokenCheckout.Registration memory reg = _registration("plsname", alice, ONE_YEAR);
        _commit(reg);
        uint256 price = _registerPrice("plsname", ONE_YEAR);
        uint256 plsIn = _quote("plsname", address(wpls)) * 102 / 100;
        vm.deal(alice, plsIn);
        vm.prank(alice);
        (, uint256 change) = checkout.registerWithPLS{value: plsIn}(reg, _swap(address(wpls), price));
        assertEq(deployed.pdaiRegistry.findOwner("plsname"), alice);
        assertEq(plsUsdc.balanceOf(alice), change);
        _assertNothingLeft();
    }

    function test_register_recentlyExpiredNameCostsAPremium() public {
        _registerDirect("lapsed", bob, 28 days);
        vm.warp(block.timestamp + 28 days + GRACE_PERIOD + 20 days); // 20 days into the 21-day premium
        uint256 base = 10e6; // a year of a 5+ letter name: exactly $10
        uint256 price = _registerPrice("lapsed", ONE_YEAR);
        assertGt(price, base + 40e6, "still a premium of about $47");

        AnyTokenCheckout.Registration memory reg = _registration("lapsed", alice, ONE_YEAR);
        _commit(reg);
        price = _registerPrice("lapsed", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price);
        vm.prank(alice);
        checkout.registerWithToken(reg, plsUsdc, price, _noSwap());
        assertEq(deployed.pdaiRegistry.findOwner("lapsed"), alice);

        vm.warp(block.timestamp + 2 days);
        assertEq(_registerPrice("other", ONE_YEAR), base, "no premium on a fresh name");
    }

    // ------------------------------------------------------------------------------------------
    // Renewal
    // ------------------------------------------------------------------------------------------

    function test_renew_withToken() public {
        _registerDirect("alice", alice, ONE_YEAR);
        uint64 before = deployed.pdaiRegistry.findExpiry("alice");
        uint256 price = deployed.registrar.getRenewPrice("alice", ONE_YEAR, plsUsdc);
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
        assertEq(deployed.pdaiRegistry.findExpiry("alice"), before + ONE_YEAR);
        _assertNothingLeft();
    }

    function test_renew_withPLS() public {
        _registerDirect("alice", alice, ONE_YEAR);
        uint64 before = deployed.pdaiRegistry.findExpiry("alice");
        uint256 price = deployed.registrar.getRenewPrice("alice", ONE_YEAR, plsUsdc);
        (, uint256 plsIn) = checkout.quoteRenew("alice", ONE_YEAR, address(pulsex), _path(address(wpls)));
        plsIn = plsIn * 102 / 100;
        vm.deal(bob, plsIn);
        vm.prank(bob);
        checkout.renewWithPLS{value: plsIn}(
            AnyTokenCheckout.Renewal("alice", ONE_YEAR, bytes32(0)), _swap(address(wpls), price)
        );
        assertEq(deployed.pdaiRegistry.findExpiry("alice"), before + ONE_YEAR);
    }

    // ------------------------------------------------------------------------------------------
    // Rejections
    // ------------------------------------------------------------------------------------------

    function test_revert_routerNotAllowed() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice, ONE_YEAR);
        SwapPayments.Swap memory s = _swap(address(pHex), 0);
        s.router = address(otherRouter);
        vm.expectRevert(abi.encodeWithSelector(SwapPayments.RouterNotAllowed.selector, address(otherRouter)));
        checkout.registerWithToken(reg, IERC20(address(pHex)), 1, s);
    }

    function test_revert_badPaths() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice, ONE_YEAR);
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
        checkout.registerWithPLS(_registration("alice", alice, ONE_YEAR), _swap(address(wpls), 0));
    }

    function test_revert_swapBelowMinimum() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice, ONE_YEAR);
        _commit(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        uint256 amountIn = _quote("alice", address(pHex));
        _fundAndApprove(pHex, alice, amountIn);
        vm.prank(alice);
        vm.expectRevert("MockSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        checkout.registerWithToken(reg, IERC20(address(pHex)), amountIn, _swap(address(pHex), price * 2));
    }

    function test_revert_paymentShortOfThePrice() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice, ONE_YEAR);
        _commit(reg);
        uint256 price = _registerPrice("alice", ONE_YEAR);
        _fundAndApprove(plsUsdc, alice, price - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SwapPayments.InsufficientPayment.selector, price - 1, price));
        checkout.registerWithToken(reg, plsUsdc, price - 1, _noSwap());
    }

    function test_revert_notCommitted() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", alice, ONE_YEAR);
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
        new AnyTokenCheckout(IETHRegistrar(address(0)), plsUsdc, IERC20(address(wpls)), routers);
        vm.expectRevert(ZeroAddress.selector);
        new AnyTokenCheckout(deployed.registrar, IERC20(address(0)), IERC20(address(wpls)), routers);
        vm.expectRevert(ZeroAddress.selector);
        new AnyTokenCheckout(deployed.registrar, plsUsdc, IERC20(address(0)), routers);
        routers = new address[](1);
        vm.expectRevert(ZeroAddress.selector);
        new AnyTokenCheckout(deployed.registrar, plsUsdc, IERC20(address(wpls)), routers);
    }

    // ------------------------------------------------------------------------------------------
    // Accounting
    // ------------------------------------------------------------------------------------------

    function test_strayBalancesAreNeverPaidOut() public {
        plsUsdc.mint(address(checkout), 100e6); // someone sends USDC here by mistake
        AnyTokenCheckout.Registration memory reg = _registration("stray", alice, ONE_YEAR);
        _commit(reg);
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
        AnyTokenCheckout.Registration memory reg = _registration("fuzzed", alice, ONE_YEAR);
        reg.duration = duration;
        _commit(reg);
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
    // Helpers
    // ------------------------------------------------------------------------------------------

    function _registerPrice(string memory label, uint64 duration) internal view returns (uint256) {
        (uint256 base, uint256 premium) = deployed.registrar.getRegisterPrice(label, duration, plsUsdc);
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

    function _assertNothingLeft() internal view {
        assertEq(plsUsdc.balanceOf(address(checkout)), 0, "no USDC left");
        assertEq(pHex.balanceOf(address(checkout)), 0, "no HEX left");
        assertEq(taxed.balanceOf(address(checkout)), 0, "no taxed token left");
        assertEq(wpls.balanceOf(address(checkout)), 0, "no WPLS left");
        assertEq(address(checkout).balance, 0, "no PLS left");
        assertEq(plsUsdc.allowance(address(checkout), address(deployed.registrar)), 0, "no registrar allowance left");
        assertEq(pHex.allowance(address(checkout), address(pulsex)), 0, "no router allowance left");
        assertEq(wpls.allowance(address(checkout), address(pulsex)), 0, "no WPLS allowance left");
    }
}
