// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";

import {PdaiDeployer} from "../../script/PdaiDeployer.sol";
import {ReservedName} from "../../script/ReservedNames.sol";
import {PulseChainAddresses as P} from "../../script/Addresses.sol";
import {AnyTokenCheckout} from "../../src/AnyTokenCheckout.sol";
import {SwapPayments} from "../../src/SwapPayments.sol";

interface IPulseXRouter {
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts);
}

/// @notice .pdai against a live copy of PulseChain: PulseX, PLS, pDAI, HEX and the tokens bridged
///         from Ethereum. Nothing is mocked.
contract PulseChainForkTest is Test, PdaiDeployer {
    Deployment internal deployed;
    address internal admin = makeAddr("pdai-names fork admin"); // Foundry's makeAddr("admin") has code on mainnet (EIP-7702)
    address internal beneficiary = makeAddr("beneficiary");
    address internal alice = makeAddr("pdai-names fork buyer");

    function setUp() public {
        vm.createSelectFork(vm.envOr("PULSECHAIN_RPC_URL", string("https://rpc.pulsechain.com")));
        // The public RPC is a group of nodes that can briefly disagree about the newest block, which
        // made setUp fail at random. Step back to a block they have all settled on.
        vm.rollFork(block.number - 16);
        address[] memory routers = new address[](2);
        routers[0] = P.PULSEX_V1_ROUTER;
        routers[1] = P.PULSEX_V2_ROUTER;
        deployed = _deploy(
            Config({
                deployer: address(this),
                admin: admin,
                beneficiary: beneficiary,
                usdc: IERC20(P.USDC),
                dai: IERC20(P.DAI),
                wpls: IERC20(P.WPLS),
                routers: routers,
                reserved: new ReservedName[](0)
            })
        );
    }

    function test_fork_buyWithPLS() public {
        AnyTokenCheckout.Registration memory reg = _registration("pdainamesfork", alice);
        _commit(reg);
        (uint256 price, uint256 plsIn) =
            deployed.checkout.quoteRegister(reg.label, reg.duration, P.PULSEX_V2_ROUTER, _path(P.WPLS));
        plsIn = plsIn * 103 / 100;
        vm.deal(alice, plsIn);

        vm.prank(alice);
        deployed.checkout.registerWithPLS{value: plsIn}(reg, _swap(P.PULSEX_V2_ROUTER, P.WPLS, price));

        assertEq(deployed.pdaiRegistry.findOwner("pdainamesfork"), alice);
        assertEq(IERC20(P.USDC).balanceOf(beneficiary), price, "the registrar was paid in bridged USDC");
        assertEq(_resolve("pdainamesfork.pdai"), alice, "resolves straight away");
    }

    /// @dev pDAI, the copy of DAI made at PulseChain's fork, along the route the app quotes: through
    ///      WPLS, whose pools with pDAI are PulseX's deepest for it, on either router.
    function test_fork_buyWithPDAI() public {
        _buyWithBridgedToken("pdainamespdai", P.PDAI, P.PULSEX_V1_ROUTER);
        _buyWithBridgedToken("pdainamespdaiv2", P.PDAI, P.PULSEX_V2_ROUTER);
    }

    function test_fork_renewWithPDAI() public {
        _buyWithBridgedToken("pdainamesrenew", P.PDAI, P.PULSEX_V1_ROUTER);
        uint64 before = deployed.pdaiRegistry.findExpiry("pdainamesrenew");
        address[] memory path = _three(P.PDAI, P.WPLS, P.USDC);
        (uint256 price, uint256 pdaiIn) =
            deployed.checkout.quoteRenew("pdainamesrenew", 365 days, P.PULSEX_V2_ROUTER, path);
        pdaiIn = pdaiIn * 103 / 100;
        address someone = makeAddr("anyone may renew");
        deal(P.PDAI, someone, pdaiIn);

        vm.startPrank(someone);
        IERC20(P.PDAI).approve(address(deployed.checkout), pdaiIn);
        uint256 change = deployed.checkout
            .renewWithToken(
                AnyTokenCheckout.Renewal("pdainamesrenew", 365 days, bytes32(0)),
                IERC20(P.PDAI),
                pdaiIn,
                SwapPayments.Swap(P.PULSEX_V2_ROUTER, path, price, block.timestamp)
            );
        vm.stopPrank();

        assertEq(deployed.pdaiRegistry.findExpiry("pdainamesrenew"), before + 365 days);
        assertEq(deployed.pdaiRegistry.findOwner("pdainamesrenew"), alice, "still alice's");
        assertEq(IERC20(P.USDC).balanceOf(someone), change);
        assertEq(IERC20(P.PDAI).balanceOf(address(deployed.checkout)), 0);
    }

    function test_fork_buyWithHEX() public {
        AnyTokenCheckout.Registration memory reg = _registration("pdainameshex", alice);
        _commit(reg);
        address[] memory path = _three(P.HEX, P.WPLS, P.USDC);
        (uint256 price, uint256 hexIn) =
            deployed.checkout.quoteRegister(reg.label, reg.duration, P.PULSEX_V1_ROUTER, path);
        hexIn = hexIn * 103 / 100;
        _buyWithPLS(P.HEX, hexIn, alice);

        vm.startPrank(alice);
        IERC20(P.HEX).approve(address(deployed.checkout), hexIn);
        (, uint256 change) = deployed.checkout
            .registerWithToken(
                reg, IERC20(P.HEX), hexIn, SwapPayments.Swap(P.PULSEX_V1_ROUTER, path, price, block.timestamp)
            );
        vm.stopPrank();

        assertEq(deployed.pdaiRegistry.findOwner("pdainameshex"), alice);
        assertEq(IERC20(P.USDC).balanceOf(alice), change);
        assertEq(IERC20(P.HEX).balanceOf(address(deployed.checkout)), 0);
        assertEq(IERC20(P.USDC).balanceOf(address(deployed.checkout)), 0);
    }

    /// @dev WETH and HEX bridged from Ethereum, along the routes the app quotes: through WPLS, on
    ///      the PulseX router with the deeper pools for each (checked on 8 November 2026).
    function test_fork_buyWithWETHFromEthereum() public {
        _buyWithBridgedToken("pdainamesweth", P.WETH_FROM_ETHEREUM, P.PULSEX_V1_ROUTER);
    }

    function test_fork_buyWithHEXFromEthereum() public {
        _buyWithBridgedToken("pdainamesehex", P.HEX_FROM_ETHEREUM, P.PULSEX_V2_ROUTER);
    }

    /// @dev USDT and DAI bridged from Ethereum, along the routes the app quotes (checked on 11
    ///      November 2026): USDT through WPLS, on V1, as PulseX has no USDT/USDC pool worth the
    ///      name; DAI straight into USDC, here on V2 (both routers have deep DAI/USDC pools).
    function test_fork_buyWithUSDTFromEthereum() public {
        _buyWithBridgedToken("pdainamesusdt", P.USDT, P.PULSEX_V1_ROUTER);
    }

    function test_fork_buyWithDAIFromEthereum() public {
        _buyWithBridgedToken("pdainamesdai", _two(P.DAI, P.USDC), P.PULSEX_V2_ROUTER);
    }

    /// @dev The app approves a little more than a payment needs, and approves again when what's
    ///      left falls short. Ethereum's own USDT refuses to change an allowance straight to another
    ///      one; the bridge's USDT on PulseChain is an ordinary token and must not.
    function test_fork_USDTFromEthereum_changesAnAllowanceLikeAnyToken() public {
        vm.startPrank(alice);
        assertTrue(IERC20(P.USDT).approve(address(deployed.checkout), 5e6));
        assertTrue(IERC20(P.USDT).approve(address(deployed.checkout), 7e6));
        vm.stopPrank();
        assertEq(IERC20(P.USDT).allowance(alice, address(deployed.checkout)), 7e6);
    }

    // ------------------------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------------------------

    function _buyWithBridgedToken(string memory label, address token, address router) internal {
        _buyWithBridgedToken(label, _three(token, P.WPLS, P.USDC), router);
    }

    function _buyWithBridgedToken(string memory label, address[] memory path, address router) internal {
        address token = path[0];
        AnyTokenCheckout.Registration memory reg = _registration(label, alice);
        _commit(reg);
        (uint256 price, uint256 amountIn) = deployed.checkout.quoteRegister(reg.label, reg.duration, router, path);
        amountIn = amountIn * 103 / 100;
        deal(token, alice, amountIn);
        uint256 usdcBefore = IERC20(P.USDC).balanceOf(alice);

        vm.startPrank(alice);
        IERC20(token).approve(address(deployed.checkout), amountIn);
        (, uint256 change) = deployed.checkout
            .registerWithToken(reg, IERC20(token), amountIn, SwapPayments.Swap(router, path, price, block.timestamp));
        vm.stopPrank();

        assertEq(deployed.pdaiRegistry.findOwner(label), alice);
        assertEq(IERC20(P.USDC).balanceOf(alice) - usdcBefore, change);
        assertEq(IERC20(token).balanceOf(address(deployed.checkout)), 0);
        assertEq(IERC20(P.USDC).balanceOf(address(deployed.checkout)), 0);
    }

    function _buyWithPLS(address token, uint256 amountOut, address to) internal {
        address[] memory path = token == P.HEX ? _two(P.WPLS, P.HEX) : _two(P.WPLS, P.USDC);
        uint256 plsIn = 100_000_000_000 ether; // far more than needed; the rest stays with this contract
        vm.deal(address(this), plsIn);
        IPulseXRouter(P.PULSEX_V1_ROUTER).swapExactETHForTokens{value: plsIn / 1000}(
            amountOut, path, to, block.timestamp
        );
    }

    function _registration(string memory label, address owner)
        internal
        pure
        returns (AnyTokenCheckout.Registration memory)
    {
        return AnyTokenCheckout.Registration(
            label, owner, keccak256(bytes(label)), IRegistry(address(0)), address(0), 365 days, bytes32(0)
        );
    }

    function _commit(AnyTokenCheckout.Registration memory reg) internal {
        deployed.registrar
            .commit(
                deployed.registrar
                    .makeCommitment(
                        reg.label, reg.owner, reg.secret, reg.subregistry, reg.resolver, reg.duration, reg.referrer
                    )
            );
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
    }

    function _path(address tokenIn) internal pure returns (address[] memory) {
        return _two(tokenIn, P.USDC);
    }

    function _two(address a, address b) internal pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = a;
        path[1] = b;
    }

    function _three(address a, address b, address c) internal pure returns (address[] memory path) {
        path = new address[](3);
        path[0] = a;
        path[1] = b;
        path[2] = c;
    }

    function _swap(address router, address tokenIn, uint256 amountOutMin)
        internal
        view
        returns (SwapPayments.Swap memory)
    {
        return SwapPayments.Swap(router, _path(tokenIn), amountOutMin, block.timestamp);
    }

    function _resolve(string memory name) internal view returns (address) {
        bytes memory dns = NameCoder.encode(name);
        (bytes memory result,) = deployed.universalResolver
            .resolve(dns, abi.encodeCall(IAddrResolver.addr, (NameCoder.namehash(dns, 0))));
        return abi.decode(result, (address));
    }

    receive() external payable {}
}
