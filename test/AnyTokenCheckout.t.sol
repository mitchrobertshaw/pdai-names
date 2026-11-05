// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AnyTokenCheckout} from "../src/AnyTokenCheckout.sol";
import {IRegistrarLike} from "../src/interfaces/IRegistrarLike.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockRegistrar} from "./mocks/MockRegistrar.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";
import {MockTaxedERC20} from "./mocks/MockTaxedERC20.sol";
import {MockWPLS} from "./mocks/MockWPLS.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";

contract AnyTokenCheckoutTest is Test {
    uint64 internal constant YEAR = 365 days;
    // $5 a year in an 18-decimal stablecoin, charged per second, rounded up so a year is never under $5.
    uint256 internal constant RATE_PER_SECOND = (5e18 + YEAR - 1) / YEAR;

    // Payment-token units out per input unit, scaled by 1e18.
    uint256 internal constant HEX_RATE = 4e25; // 1 HEX (8 decimals) = $0.004
    uint256 internal constant WPLS_RATE = 5.7e12; // 1 PLS = $0.0000057
    uint256 internal constant TAXED_RATE = 1e16; // 1 TAX = $0.01
    uint256 internal constant TAX_BPS = 500; // 5% on every transfer

    MockERC20 internal dai;
    MockERC20 internal hexToken;
    MockTaxedERC20 internal taxed;
    MockWPLS internal wpls;
    MockSwapRouter internal router;
    MockSwapRouter internal otherRouter;
    MockRegistrar internal registrar;
    AnyTokenCheckout internal checkout;

    address internal buyer = makeAddr("buyer");
    address internal friend = makeAddr("friend");
    address internal beneficiary = makeAddr("beneficiary");

    event Paid(
        address indexed payer, address indexed tokenIn, uint256 amountIn, uint256 price, uint256 change, bool renewal
    );

    function setUp() public {
        dai = new MockERC20("Dai Stablecoin from Ethereum", "DAI", 18);
        hexToken = new MockERC20("HEX", "HEX", 8);
        taxed = new MockTaxedERC20("Taxed", "TAX", 18, TAX_BPS);
        wpls = new MockWPLS();

        router = new MockSwapRouter();
        router.setRate(address(hexToken), address(dai), HEX_RATE);
        router.setRate(address(wpls), address(dai), WPLS_RATE);
        router.setRate(address(taxed), address(dai), TAXED_RATE);
        otherRouter = new MockSwapRouter();

        registrar = new MockRegistrar(IERC20(address(dai)), beneficiary, RATE_PER_SECOND);

        address[] memory routers = new address[](1);
        routers[0] = address(router);
        checkout = new AnyTokenCheckout(
            IRegistrarLike(address(registrar)), IERC20(address(dai)), IERC20(address(wpls)), routers
        );
    }

    // ------------------------------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------------------------------

    function test_RegisterWithToken_PaysPriceAndReturnsChange() public {
        AnyTokenCheckout.Registration memory reg = _registration("alice", buyer);
        _commit(reg);
        uint256 price = _price(YEAR);

        (uint256 quotedPrice, uint256 quotedIn) =
            checkout.quoteRegister(reg.label, reg.duration, address(router), _path(address(hexToken), address(dai)));
        assertEq(quotedPrice, price, "quoted price");

        uint256 amountIn = quotedIn * 102 / 100; // 2% buffer
        uint256 got = amountIn * HEX_RATE / 1e18;
        _fundAndApprove(hexToken, buyer, amountIn);

        vm.prank(buyer);
        vm.expectEmit(true, true, false, true, address(checkout));
        emit Paid(buyer, address(hexToken), amountIn, price, got - price, false);
        (uint256 tokenId, uint256 change) =
            checkout.registerWithToken(reg, IERC20(address(hexToken)), amountIn, _swap(address(hexToken), price));

        assertEq(registrar.ownerOf(tokenId), buyer, "owner");
        assertEq(dai.balanceOf(beneficiary), price, "registrar paid exactly the price");
        assertEq(change, got - price, "change");
        assertEq(dai.balanceOf(buyer), change, "buyer got the change");
        assertEq(hexToken.balanceOf(buyer), 0, "buyer spent amountIn");
        _assertNothingLeft();
    }

    function test_RegisterWithToken_AsGift() public {
        AnyTokenCheckout.Registration memory reg = _registration("for-a-friend", friend);
        _commit(reg);
        uint256 price = _price(YEAR);
        uint256 amountIn = _quote(reg, address(hexToken)) * 105 / 100;
        _fundAndApprove(hexToken, buyer, amountIn);

        vm.prank(buyer);
        (uint256 tokenId, uint256 change) =
            checkout.registerWithToken(reg, IERC20(address(hexToken)), amountIn, _swap(address(hexToken), price));

        assertEq(registrar.ownerOf(tokenId), friend, "name goes to the owner in the commitment");
        assertEq(dai.balanceOf(buyer), change, "change goes to the payer");
        assertEq(dai.balanceOf(friend), 0, "friend receives no change");
        _assertNothingLeft();
    }

    function test_RegisterWithTaxedToken() public {
        AnyTokenCheckout.Registration memory reg = _registration("taxed", buyer);
        _commit(reg);
        uint256 price = _price(YEAR);
        // Taxed twice on the way in (buyer -> checkout, checkout -> router), about 9.75%.
        uint256 amountIn = _quote(reg, address(taxed)) * 112 / 100;
        uint256 got = _afterTax(_afterTax(amountIn)) * TAXED_RATE / 1e18;
        _fundAndApprove(taxed, buyer, amountIn);

        vm.prank(buyer);
        (, uint256 change) =
            checkout.registerWithToken(reg, IERC20(address(taxed)), amountIn, _swap(address(taxed), price));

        assertEq(dai.balanceOf(beneficiary), price, "registrar paid exactly the price");
        assertEq(change, got - price, "change is measured after both taxes");
        _assertNothingLeft();
    }

    function test_RevertWhen_TaxedTokenBufferTooSmall() public {
        AnyTokenCheckout.Registration memory reg = _registration("undertaxed", buyer);
        _commit(reg);
        uint256 price = _price(YEAR);
        uint256 amountIn = _quote(reg, address(taxed)) * 102 / 100; // 2% does not cover ~9.75% tax
        uint256 got = _afterTax(_afterTax(amountIn)) * TAXED_RATE / 1e18;
        _fundAndApprove(taxed, buyer, amountIn);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(AnyTokenCheckout.InsufficientPayment.selector, got, price));
        checkout.registerWithToken(reg, IERC20(address(taxed)), amountIn, _swap(address(taxed), 0));
    }

    function test_RegisterWithPLS() public {
        AnyTokenCheckout.Registration memory reg = _registration("paid-in-pls", buyer);
        _commit(reg);
        uint256 price = _price(YEAR);
        uint256 value = _quote(reg, address(wpls)) * 101 / 100;
        uint256 got = value * WPLS_RATE / 1e18;
        vm.deal(buyer, value);

        vm.prank(buyer);
        (uint256 tokenId, uint256 change) =
            checkout.registerWithPLS{value: value}(reg, _swap(address(wpls), price));

        assertEq(registrar.ownerOf(tokenId), buyer, "owner");
        assertEq(dai.balanceOf(beneficiary), price, "registrar paid exactly the price");
        assertEq(change, got - price, "change");
        assertEq(dai.balanceOf(buyer), change, "change comes back in the payment token");
        assertEq(buyer.balance, 0, "buyer spent the PLS");
        _assertNothingLeft();
    }

    function test_RegisterWithPaymentTokenDirectly() public {
        AnyTokenCheckout.Registration memory reg = _registration("paid-in-dai", buyer);
        _commit(reg);
        uint256 price = _price(YEAR);
        uint256 amountIn = price + 1e18;
        _fundAndApprove(dai, buyer, amountIn);

        (, uint256 quotedIn) = checkout.quoteRegister(reg.label, reg.duration, address(0), new address[](0));
        assertEq(quotedIn, price, "direct quote is the price");

        vm.prank(buyer);
        (uint256 tokenId, uint256 change) =
            checkout.registerWithToken(reg, IERC20(address(dai)), amountIn, _noSwap());

        assertEq(registrar.ownerOf(tokenId), buyer, "owner");
        assertEq(dai.balanceOf(beneficiary), price, "registrar paid exactly the price");
        assertEq(change, 1e18, "the extra comes back");
        assertEq(dai.balanceOf(buyer), 1e18, "buyer keeps the extra");
        _assertNothingLeft();
    }

    function test_RegisterIncludesPremium() public {
        registrar.setPremium(3e18);
        AnyTokenCheckout.Registration memory reg = _registration("recently-expired", buyer);
        _commit(reg);
        uint256 price = _price(YEAR) + 3e18;

        (uint256 quotedPrice, uint256 quotedIn) =
            checkout.quoteRegister(reg.label, reg.duration, address(router), _path(address(hexToken), address(dai)));
        assertEq(quotedPrice, price, "quote includes the premium");

        uint256 amountIn = quotedIn * 102 / 100;
        _fundAndApprove(hexToken, buyer, amountIn);
        vm.prank(buyer);
        checkout.registerWithToken(reg, IERC20(address(hexToken)), amountIn, _swap(address(hexToken), price));

        assertEq(dai.balanceOf(beneficiary), price, "registrar paid base plus premium");
        _assertNothingLeft();
    }

    // ------------------------------------------------------------------------------------------
    // Renewal
    // ------------------------------------------------------------------------------------------

    function test_RenewWithToken() public {
        uint256 tokenId = _registerWithDai("renew-me");
        uint64 expiryBefore = registrar.expiry(tokenId);
        uint256 beneficiaryBefore = dai.balanceOf(beneficiary);

        AnyTokenCheckout.Renewal memory ren = AnyTokenCheckout.Renewal("renew-me", YEAR, bytes32(0));
        uint256 price = _price(YEAR);
        (uint256 quotedPrice, uint256 quotedIn) =
            checkout.quoteRenew(ren.label, ren.duration, address(router), _path(address(hexToken), address(dai)));
        assertEq(quotedPrice, price, "renewal quote");

        uint256 amountIn = quotedIn * 102 / 100;
        uint256 got = amountIn * HEX_RATE / 1e18;
        _fundAndApprove(hexToken, friend, amountIn); // anyone can renew

        vm.prank(friend);
        uint256 change = checkout.renewWithToken(ren, IERC20(address(hexToken)), amountIn, _swap(address(hexToken), price));

        assertEq(uint256(registrar.expiry(tokenId)), uint256(expiryBefore + YEAR), "expiry extended by a year");
        assertEq(dai.balanceOf(beneficiary) - beneficiaryBefore, price, "registrar paid the renewal price");
        assertEq(change, got - price, "change");
        assertEq(dai.balanceOf(friend), change, "change goes to the payer");
        assertEq(registrar.ownerOf(tokenId), buyer, "renewing does not change the owner");
        _assertNothingLeft();
    }

    function test_RenewWithPLS() public {
        uint256 tokenId = _registerWithDai("renew-with-pls");
        uint64 expiryBefore = registrar.expiry(tokenId);

        AnyTokenCheckout.Renewal memory ren = AnyTokenCheckout.Renewal("renew-with-pls", YEAR, bytes32(0));
        (, uint256 quotedIn) =
            checkout.quoteRenew(ren.label, ren.duration, address(router), _path(address(wpls), address(dai)));
        uint256 value = quotedIn * 101 / 100;
        vm.deal(buyer, value);

        vm.prank(buyer);
        checkout.renewWithPLS{value: value}(ren, _swap(address(wpls), 0));

        assertEq(uint256(registrar.expiry(tokenId)), uint256(expiryBefore + YEAR), "expiry extended by a year");
        _assertNothingLeft();
    }

    // ------------------------------------------------------------------------------------------
    // Rejections
    // ------------------------------------------------------------------------------------------

    function test_RevertWhen_RouterNotAllowed() public {
        AnyTokenCheckout.Registration memory reg = _registration("bad-router", buyer);
        AnyTokenCheckout.Swap memory swap = _swap(address(hexToken), 0);
        swap.router = address(otherRouter);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(AnyTokenCheckout.RouterNotAllowed.selector, address(otherRouter)));
        checkout.registerWithToken(reg, IERC20(address(hexToken)), 1e8, swap);
    }

    function test_RevertWhen_PathDoesNotStartWithInputToken() public {
        AnyTokenCheckout.Registration memory reg = _registration("bad-start", buyer);
        AnyTokenCheckout.Swap memory swap = _swap(address(taxed), 0); // path starts with a different token

        vm.prank(buyer);
        vm.expectRevert(AnyTokenCheckout.InvalidPath.selector);
        checkout.registerWithToken(reg, IERC20(address(hexToken)), 1e8, swap);
    }

    function test_RevertWhen_PathDoesNotEndWithPaymentToken() public {
        AnyTokenCheckout.Registration memory reg = _registration("bad-end", buyer);
        AnyTokenCheckout.Swap memory swap = _swap(address(hexToken), 0);
        swap.path = _path(address(hexToken), address(wpls));

        vm.prank(buyer);
        vm.expectRevert(AnyTokenCheckout.InvalidPath.selector);
        checkout.registerWithToken(reg, IERC20(address(hexToken)), 1e8, swap);
    }

    function test_RevertWhen_PathTooShort() public {
        AnyTokenCheckout.Registration memory reg = _registration("short-path", buyer);
        AnyTokenCheckout.Swap memory swap = _swap(address(hexToken), 0);
        swap.path = new address[](1);
        swap.path[0] = address(hexToken);

        vm.prank(buyer);
        vm.expectRevert(AnyTokenCheckout.InvalidPath.selector);
        checkout.registerWithToken(reg, IERC20(address(hexToken)), 1e8, swap);
    }

    function test_RevertWhen_PaymentTokenGivenAPath() public {
        AnyTokenCheckout.Registration memory reg = _registration("dai-with-path", buyer);
        AnyTokenCheckout.Swap memory swap = _swap(address(dai), 0);

        vm.prank(buyer);
        vm.expectRevert(AnyTokenCheckout.InvalidPath.selector);
        checkout.registerWithToken(reg, IERC20(address(dai)), 1e18, swap);
    }

    function test_RevertWhen_PLSPathDoesNotStartWithWPLS() public {
        AnyTokenCheckout.Registration memory reg = _registration("pls-bad-path", buyer);
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);
        vm.expectRevert(AnyTokenCheckout.InvalidPath.selector);
        checkout.registerWithPLS{value: 1 ether}(reg, _swap(address(hexToken), 0));
    }

    function test_RevertWhen_NoPLSSent() public {
        AnyTokenCheckout.Registration memory reg = _registration("no-pls", buyer);

        vm.prank(buyer);
        vm.expectRevert(AnyTokenCheckout.NoValue.selector);
        checkout.registerWithPLS(reg, _swap(address(wpls), 0));
    }

    function test_RevertWhen_SwapReturnsLessThanMinimum() public {
        AnyTokenCheckout.Registration memory reg = _registration("slippage", buyer);
        _commit(reg);
        uint256 amountIn = _quote(reg, address(hexToken));
        _fundAndApprove(hexToken, buyer, amountIn);
        AnyTokenCheckout.Swap memory swap = _swap(address(hexToken), _price(YEAR) * 2);

        vm.prank(buyer);
        vm.expectRevert(bytes("MockSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        checkout.registerWithToken(reg, IERC20(address(hexToken)), amountIn, swap);
    }

    function test_RevertWhen_SwapDeadlinePassed() public {
        AnyTokenCheckout.Registration memory reg = _registration("late", buyer);
        _commit(reg);
        uint256 amountIn = _quote(reg, address(hexToken)) * 102 / 100;
        _fundAndApprove(hexToken, buyer, amountIn);
        AnyTokenCheckout.Swap memory swap = _swap(address(hexToken), 0);
        swap.deadline = block.timestamp - 1;

        vm.prank(buyer);
        vm.expectRevert(bytes("MockSwapRouter: EXPIRED"));
        checkout.registerWithToken(reg, IERC20(address(hexToken)), amountIn, swap);
    }

    function test_RevertWhen_NotCommitted() public {
        AnyTokenCheckout.Registration memory reg = _registration("uncommitted", buyer);
        uint256 amountIn = _quote(reg, address(hexToken)) * 102 / 100;
        _fundAndApprove(hexToken, buyer, amountIn);

        vm.prank(buyer);
        vm.expectRevert(MockRegistrar.NoCommitment.selector);
        checkout.registerWithToken(reg, IERC20(address(hexToken)), amountIn, _swap(address(hexToken), 0));
    }

    function test_RevertWhen_TokenReentersCheckout() public {
        ReentrantToken evil = new ReentrantToken();
        router.setRate(address(evil), address(dai), 1e18);
        AnyTokenCheckout.Registration memory reg = _registration("reentry", buyer);
        _commit(reg);
        evil.mint(buyer, 10e18);
        vm.prank(buyer);
        evil.approve(address(checkout), 10e18);
        evil.arm(checkout);

        vm.prank(buyer);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        checkout.registerWithToken(reg, IERC20(address(evil)), 10e18, _swap(address(evil), 0));
    }

    function test_RevertWhen_QuotingWithRouterNotAllowed() public {
        vm.expectRevert(abi.encodeWithSelector(AnyTokenCheckout.RouterNotAllowed.selector, address(otherRouter)));
        checkout.quoteRegister("quote", YEAR, address(otherRouter), _path(address(hexToken), address(dai)));
    }

    function test_RevertWhen_ConstructedWithZeroAddress() public {
        address[] memory routers = new address[](1);
        routers[0] = address(0);
        vm.expectRevert(AnyTokenCheckout.ZeroAddress.selector);
        new AnyTokenCheckout(IRegistrarLike(address(registrar)), IERC20(address(dai)), IERC20(address(wpls)), routers);

        vm.expectRevert(AnyTokenCheckout.ZeroAddress.selector);
        new AnyTokenCheckout(IRegistrarLike(address(0)), IERC20(address(dai)), IERC20(address(wpls)), new address[](0));
    }

    // ------------------------------------------------------------------------------------------
    // Accounting
    // ------------------------------------------------------------------------------------------

    function test_StrayBalancesAreNeverPaidOut() public {
        dai.mint(address(checkout), 100e18); // someone sends DAI here by mistake
        AnyTokenCheckout.Registration memory reg = _registration("stray", buyer);
        _commit(reg);
        uint256 price = _price(YEAR);
        uint256 amountIn = _quote(reg, address(hexToken)) * 102 / 100;
        uint256 got = amountIn * HEX_RATE / 1e18;
        _fundAndApprove(hexToken, buyer, amountIn);

        vm.prank(buyer);
        (, uint256 change) =
            checkout.registerWithToken(reg, IERC20(address(hexToken)), amountIn, _swap(address(hexToken), price));

        assertEq(change, got - price, "change excludes the stray DAI");
        assertEq(dai.balanceOf(address(checkout)), 100e18, "stray DAI stays where it is");
    }

    function test_AllowedRoutersAreFixedAtDeployment() public view {
        assertTrue(checkout.isAllowedRouter(address(router)), "router allowed");
        assertFalse(checkout.isAllowedRouter(address(otherRouter)), "other router not allowed");
        assertEq(address(checkout.REGISTRAR()), address(registrar), "registrar");
        assertEq(address(checkout.PAYMENT_TOKEN()), address(dai), "payment token");
        assertEq(address(checkout.WPLS()), address(wpls), "wpls");
    }

    function testFuzz_RegisterWithToken_Accounting(uint256 amountIn, uint64 duration) public {
        duration = uint64(bound(duration, 28 days, 10 * YEAR));
        AnyTokenCheckout.Registration memory reg = _registration("fuzz", buyer);
        reg.duration = duration;
        _commit(reg);
        uint256 price = _price(duration);
        uint256 minIn = (price * 1e18 + HEX_RATE - 1) / HEX_RATE; // smallest input that covers the price
        amountIn = bound(amountIn, minIn, minIn * 1000);
        uint256 got = amountIn * HEX_RATE / 1e18;
        _fundAndApprove(hexToken, buyer, amountIn);

        vm.prank(buyer);
        (, uint256 change) =
            checkout.registerWithToken(reg, IERC20(address(hexToken)), amountIn, _swap(address(hexToken), 0));

        assertEq(dai.balanceOf(beneficiary), price, "registrar paid exactly the price");
        assertEq(change, got - price, "change");
        assertEq(dai.balanceOf(buyer), change, "buyer got the change");
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
            subregistry: address(0),
            resolver: address(0),
            duration: YEAR,
            referrer: bytes32(0)
        });
    }

    function _commit(AnyTokenCheckout.Registration memory reg) internal {
        registrar.commit(
            registrar.makeCommitment(
                reg.label, reg.owner, reg.secret, reg.subregistry, reg.resolver, reg.duration, reg.referrer
            )
        );
        vm.warp(vm.getBlockTimestamp() + registrar.MIN_COMMITMENT_AGE());
    }

    function _registerWithDai(string memory label) internal returns (uint256 tokenId) {
        AnyTokenCheckout.Registration memory reg = _registration(label, buyer);
        _commit(reg);
        uint256 price = _price(YEAR);
        _fundAndApprove(dai, buyer, price);
        vm.prank(buyer);
        (tokenId,) = checkout.registerWithToken(reg, IERC20(address(dai)), price, _noSwap());
    }

    function _quote(AnyTokenCheckout.Registration memory reg, address tokenIn) internal view returns (uint256 amountIn) {
        (, amountIn) = checkout.quoteRegister(reg.label, reg.duration, address(router), _path(tokenIn, address(dai)));
    }

    function _fundAndApprove(MockERC20 token, address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(checkout), amount);
    }

    function _price(uint64 duration) internal pure returns (uint256) {
        return RATE_PER_SECOND * duration;
    }

    function _afterTax(uint256 amount) internal pure returns (uint256) {
        return amount - amount * TAX_BPS / 10_000;
    }

    function _path(address a, address b) internal pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = a;
        path[1] = b;
    }

    function _swap(address tokenIn, uint256 amountOutMin) internal view returns (AnyTokenCheckout.Swap memory) {
        return AnyTokenCheckout.Swap({
            router: address(router),
            path: _path(tokenIn, address(dai)),
            amountOutMin: amountOutMin,
            deadline: block.timestamp + 1 hours
        });
    }

    function _noSwap() internal pure returns (AnyTokenCheckout.Swap memory) {
        return AnyTokenCheckout.Swap({router: address(0), path: new address[](0), amountOutMin: 0, deadline: 0});
    }

    function _assertNothingLeft() internal view {
        assertEq(dai.balanceOf(address(checkout)), 0, "no DAI left in checkout");
        assertEq(hexToken.balanceOf(address(checkout)), 0, "no HEX left in checkout");
        assertEq(taxed.balanceOf(address(checkout)), 0, "no taxed token left in checkout");
        assertEq(wpls.balanceOf(address(checkout)), 0, "no WPLS left in checkout");
        assertEq(address(checkout).balance, 0, "no PLS left in checkout");
        assertEq(dai.allowance(address(checkout), address(registrar)), 0, "no registrar allowance left");
        assertEq(hexToken.allowance(address(checkout), address(router)), 0, "no HEX router allowance left");
        assertEq(taxed.allowance(address(checkout), address(router)), 0, "no taxed router allowance left");
        assertEq(wpls.allowance(address(checkout), address(router)), 0, "no WPLS router allowance left");
    }
}
