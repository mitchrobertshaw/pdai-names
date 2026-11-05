// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AnyTokenCheckout} from "../../src/AnyTokenCheckout.sol";
import {IRegistrarLike} from "../../src/interfaces/IRegistrarLike.sol";
import {ISwapRouterLike} from "../../src/interfaces/ISwapRouterLike.sol";
import {MockRegistrar} from "../mocks/MockRegistrar.sol";

/// @notice The PulseX router function these tests use to buy tokens with PLS.
interface IPulseXBuy {
    function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts);
}

/// @notice Runs the checkout against a live copy of PulseChain: real PulseX routers, real pools,
///         real tokens, and DAI bridged from Ethereum as the payment token. Only the registrar is
///         a stand-in, because the .pdai registrar is not deployed yet.
/// @dev Set PULSECHAIN_RPC_URL to use your own node; it defaults to the public RPC.
///      Results depend on live pool prices at the time of the run.
contract AnyTokenCheckoutForkTest is Test {
    // Addresses checked on-chain on 2026-11-05.
    address internal constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address internal constant DAI = 0xefD766cCb38EaF1dfd701853BFCe31359239F305; // "Dai Stablecoin from Ethereum"
    address internal constant HEX = 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39;
    address internal constant PLSX = 0x95B303987A60C71504D99Aa1b13B4DA07b0790ab;
    address internal constant PDAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F; // the forked copy of DAI
    address internal constant PULSEX_V1_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address internal constant PULSEX_V2_ROUTER = 0x165C3410fC91EF562C50559f7d2289fEbed552d9;

    uint64 internal constant YEAR = 365 days;
    uint256 internal constant RATE_PER_SECOND = (5e18 + YEAR - 1) / YEAR; // $5 a year

    MockRegistrar internal registrar;
    AnyTokenCheckout internal checkout;

    address internal buyer = makeAddr("buyer");
    address internal beneficiary = makeAddr("beneficiary");

    function setUp() public {
        vm.createSelectFork(vm.envOr("PULSECHAIN_RPC_URL", string("https://rpc.pulsechain.com")));

        registrar = new MockRegistrar(IERC20(DAI), beneficiary, RATE_PER_SECOND);
        address[] memory routers = new address[](2);
        routers[0] = PULSEX_V1_ROUTER;
        routers[1] = PULSEX_V2_ROUTER;
        checkout = new AnyTokenCheckout(IRegistrarLike(address(registrar)), IERC20(DAI), IERC20(WPLS), routers);
    }

    function test_Fork_RegisterWithPLS() public {
        AnyTokenCheckout.Registration memory reg = _registration("fork-pls");
        _commit(reg);
        uint256 price = RATE_PER_SECOND * YEAR;
        (address router, address[] memory path, uint256 quotedIn) = _bestRoute(WPLS, price);

        uint256 value = quotedIn * 101 / 100;
        vm.deal(buyer, value);
        vm.prank(buyer);
        (uint256 tokenId, uint256 change) = checkout.registerWithPLS{value: value}(reg, _swap(router, path, price));

        _assertPaid(tokenId, price, change);
    }

    function test_Fork_RegisterWithHEX() public {
        _registerWithToken("fork-hex", HEX);
    }

    function test_Fork_RegisterWithPLSX() public {
        _registerWithToken("fork-plsx", PLSX);
    }

    function test_Fork_RegisterWithPDAI() public {
        _registerWithToken("fork-pdai", PDAI);
    }

    function test_Fork_RenewWithPLS() public {
        uint256 tokenId = _registerWithToken("fork-renew", HEX);
        uint64 expiryBefore = registrar.expiry(tokenId);
        uint256 beneficiaryBefore = IERC20(DAI).balanceOf(beneficiary);

        uint256 price = RATE_PER_SECOND * YEAR;
        (address router, address[] memory path, uint256 quotedIn) = _bestRoute(WPLS, price);
        uint256 value = quotedIn * 101 / 100;
        vm.deal(buyer, value);
        vm.prank(buyer);
        checkout.renewWithPLS{value: value}(
            AnyTokenCheckout.Renewal("fork-renew", YEAR, bytes32(0)), _swap(router, path, price)
        );

        assertEq(uint256(registrar.expiry(tokenId)), uint256(expiryBefore + YEAR), "expiry extended by a year");
        assertEq(IERC20(DAI).balanceOf(beneficiary) - beneficiaryBefore, price, "registrar paid the renewal price");
        _assertNothingLeft();
    }

    // ------------------------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------------------------

    function _registerWithToken(string memory label, address token) internal returns (uint256 tokenId) {
        AnyTokenCheckout.Registration memory reg = _registration(label);
        _commit(reg);
        uint256 price = RATE_PER_SECOND * YEAR;
        (address router, address[] memory path, uint256 quotedIn) = _bestRoute(token, price);

        uint256 amountIn = quotedIn * 101 / 100;
        _buyWithPLS(token, amountIn);
        vm.prank(buyer);
        IERC20(token).approve(address(checkout), amountIn);

        uint256 change;
        vm.prank(buyer);
        (tokenId, change) = checkout.registerWithToken(reg, IERC20(token), amountIn, _swap(router, path, price));

        _assertPaid(tokenId, price, change);
        assertEq(IERC20(token).balanceOf(buyer), 0, "buyer spent amountIn");
        assertEq(IERC20(token).balanceOf(address(checkout)), 0, "no input token left in checkout");
    }

    /// @dev Buys exactly `amountOut` of `token` for the buyer with PLS on PulseX, so the balance comes
    ///      from the token's own transfer code. Writing balances straight into storage, as forge-std's
    ///      `deal` does, breaks tokens such as PLSX that keep extra records per holder.
    function _buyWithPLS(address token, uint256 amountOut) internal {
        address[] memory path = new address[](2);
        path[0] = WPLS;
        path[1] = token;
        (address router, uint256 plsIn) = _cheapestRouter(path, amountOut);
        plsIn = plsIn * 101 / 100; // the router refunds whatever isn't needed
        vm.deal(buyer, plsIn);
        vm.prank(buyer);
        IPulseXBuy(router).swapETHForExactTokens{value: plsIn}(
            amountOut, path, buyer, vm.getBlockTimestamp() + 1 hours
        );
        assertEq(IERC20(token).balanceOf(buyer), amountOut, "buyer bought exactly amountOut");
    }

    /// @dev The PulseX router that sells `amountOut` of the last token in `path` for the least input.
    function _cheapestRouter(address[] memory path, uint256 amountOut)
        internal
        view
        returns (address best, uint256 bestIn)
    {
        address[2] memory routers = [PULSEX_V1_ROUTER, PULSEX_V2_ROUTER];
        bestIn = type(uint256).max;
        for (uint256 i = 0; i < routers.length; ++i) {
            try ISwapRouterLike(routers[i]).getAmountsIn(amountOut, path) returns (uint256[] memory amounts) {
                if (amounts[0] != 0 && amounts[0] < bestIn) {
                    bestIn = amounts[0];
                    best = routers[i];
                }
            } catch {}
        }
        require(best != address(0), "no PulseX pool for this path");
    }

    /// @dev Cheapest way to buy `price` of DAI with `tokenIn`, across both PulseX routers and
    ///      the direct and via-WPLS paths.
    function _bestRoute(address tokenIn, uint256 price)
        internal
        view
        returns (address bestRouter, address[] memory bestPath, uint256 bestIn)
    {
        address[2] memory routers = [PULSEX_V1_ROUTER, PULSEX_V2_ROUTER];
        address[][] memory paths = new address[][](tokenIn == WPLS ? 1 : 2);
        paths[0] = new address[](2);
        paths[0][0] = tokenIn;
        paths[0][1] = DAI;
        if (tokenIn != WPLS) {
            paths[1] = new address[](3);
            paths[1][0] = tokenIn;
            paths[1][1] = WPLS;
            paths[1][2] = DAI;
        }

        bestIn = type(uint256).max;
        for (uint256 i = 0; i < routers.length; ++i) {
            for (uint256 j = 0; j < paths.length; ++j) {
                try ISwapRouterLike(routers[i]).getAmountsIn(price, paths[j]) returns (uint256[] memory amounts) {
                    if (amounts[0] != 0 && amounts[0] < bestIn) {
                        bestIn = amounts[0];
                        bestRouter = routers[i];
                        bestPath = paths[j];
                    }
                } catch {}
            }
        }
        require(bestRouter != address(0), "no PulseX route from this token to DAI");
    }

    function _registration(string memory label) internal view returns (AnyTokenCheckout.Registration memory) {
        return AnyTokenCheckout.Registration({
            label: label,
            owner: buyer,
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

    function _swap(address router, address[] memory path, uint256 amountOutMin)
        internal
        view
        returns (AnyTokenCheckout.Swap memory)
    {
        return AnyTokenCheckout.Swap({
            router: router, path: path, amountOutMin: amountOutMin, deadline: block.timestamp + 1 hours
        });
    }

    function _assertPaid(uint256 tokenId, uint256 price, uint256 change) internal view {
        assertEq(registrar.ownerOf(tokenId), buyer, "owner");
        assertEq(IERC20(DAI).balanceOf(beneficiary), price, "registrar paid exactly $5 in bridged DAI");
        assertEq(IERC20(DAI).balanceOf(buyer), change, "buyer got the change in bridged DAI");
        _assertNothingLeft();
    }

    function _assertNothingLeft() internal view {
        assertEq(IERC20(DAI).balanceOf(address(checkout)), 0, "no DAI left in checkout");
        assertEq(IERC20(WPLS).balanceOf(address(checkout)), 0, "no WPLS left in checkout");
        assertEq(address(checkout).balance, 0, "no PLS left in checkout");
    }
}
