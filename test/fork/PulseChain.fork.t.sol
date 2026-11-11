// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";

import {HexDeployer} from "../../script/HexDeployer.sol";
import {ReservedName} from "../../script/ReservedNames.sol";
import {PulseChainAddresses as P} from "../../script/Addresses.sol";
import {SwapPayments} from "../../src/common/SwapPayments.sol";
import {IAMB} from "../../src/interfaces/IAMB.sol";
import {AnyTokenCheckout} from "../../src/pulsechain/AnyTokenCheckout.sol";
import {HexOrderFiller} from "../../src/pulsechain/HexOrderFiller.sol";

interface IPulseXRouter {
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts);
}

/// @notice The PulseChain side against a live copy of PulseChain: the real bridge contract, PulseX,
///         PLS, HEX and USDC bridged from Ethereum. Nothing is mocked.
contract PulseChainForkTest is Test, HexDeployer {
    bytes32 internal constant USER_REQUEST_FOR_SIGNATURE = keccak256("UserRequestForSignature(bytes32,bytes)");

    Hub internal hub;
    address internal admin = makeAddr("hex-names fork admin"); // Foundry's makeAddr("admin") has code on mainnet (EIP-7702)
    address internal beneficiary = makeAddr("beneficiary");
    address internal alice = makeAddr("hex-names fork buyer");
    address internal bot = makeAddr("bot");
    address internal ethMirrorRegistrar = makeAddr("Ethereum HexMirrorRegistrar");
    address internal ethOrderBook = makeAddr("Ethereum HexOrderBook");

    function setUp() public {
        vm.createSelectFork(vm.envOr("PULSECHAIN_RPC_URL", string("https://rpc.pulsechain.com")));
        // The public RPC is a group of nodes that can briefly disagree about the newest block, which
        // made setUp fail at random. Step back to a block they have all settled on.
        vm.rollFork(block.number - 16);
        address[] memory routers = new address[](2);
        routers[0] = P.PULSEX_V1_ROUTER;
        routers[1] = P.PULSEX_V2_ROUTER;
        hub = _deployHub(
            HubConfig({
                deployer: address(this),
                admin: admin,
                beneficiary: beneficiary,
                amb: IAMB(P.AMB),
                ethereumChainId: ETHEREUM_CHAIN_ID,
                usdc: IERC20(P.USDC),
                dai: IERC20(P.DAI),
                wpls: IERC20(P.WPLS),
                routers: routers,
                mirrorGas: 1_000_000,
                settleGas: 300_000,
                reserved: new ReservedName[](0)
            })
        );
        hub.mirrorSync.link(ethMirrorRegistrar);
        hub.orderFiller.link(ethOrderBook);
    }

    function test_fork_buyWithPLS_andTheCopyIsSentOverTheRealBridge() public {
        AnyTokenCheckout.Registration memory reg = _registration("hexnamesfork", alice);
        _commit(reg);
        (uint256 price, uint256 plsIn) =
            hub.checkout.quoteRegister(reg.label, reg.duration, P.PULSEX_V2_ROUTER, _path(P.WPLS));
        plsIn = plsIn * 103 / 100;
        vm.deal(alice, plsIn);

        vm.recordLogs();
        vm.prank(alice);
        hub.checkout.registerWithPLS{value: plsIn}(reg, _swap(P.PULSEX_V2_ROUTER, P.WPLS, price));

        assertEq(hub.core.hexRegistry.findOwner("hexnamesfork"), alice);
        assertEq(IERC20(P.USDC).balanceOf(beneficiary), price, "the registrar was paid in bridged USDC");
        _assertBridgeMessage(vm.getRecordedLogs(), address(hub.mirrorSync), ethMirrorRegistrar, 1_000_000);
        assertEq(_resolve("hexnamesfork.hex"), alice, "resolves on PulseChain straight away");
    }

    function test_fork_buyWithHEX() public {
        AnyTokenCheckout.Registration memory reg = _registration("hexnameshex", alice);
        _commit(reg);
        address[] memory path = new address[](3);
        path[0] = P.HEX;
        path[1] = P.WPLS;
        path[2] = P.USDC;
        (uint256 price, uint256 hexIn) = hub.checkout.quoteRegister(reg.label, reg.duration, P.PULSEX_V1_ROUTER, path);
        hexIn = hexIn * 103 / 100;
        _buyWithPLS(P.HEX, hexIn, alice);

        vm.startPrank(alice);
        IERC20(P.HEX).approve(address(hub.checkout), hexIn);
        (, uint256 change) = hub.checkout
            .registerWithToken(
                reg, IERC20(P.HEX), hexIn, SwapPayments.Swap(P.PULSEX_V1_ROUTER, path, price, block.timestamp)
            );
        vm.stopPrank();

        assertEq(hub.core.hexRegistry.findOwner("hexnameshex"), alice);
        assertEq(IERC20(P.USDC).balanceOf(alice), change);
        assertEq(IERC20(P.HEX).balanceOf(address(hub.checkout)), 0);
        assertEq(IERC20(P.USDC).balanceOf(address(hub.checkout)), 0);
    }

    /// @dev WETH and HEX bridged from Ethereum, along the routes the app quotes: through WPLS, on
    ///      the PulseX router with the deeper pools for each (checked on 8 November 2026).
    function test_fork_buyWithWETHFromEthereum() public {
        _buyWithBridgedToken("hexnamesweth", P.WETH_FROM_ETHEREUM, P.PULSEX_V1_ROUTER);
    }

    function test_fork_buyWithHEXFromEthereum() public {
        _buyWithBridgedToken("hexnamesehex", P.HEX_FROM_ETHEREUM, P.PULSEX_V2_ROUTER);
    }

    /// @dev USDT and DAI bridged from Ethereum, along the routes the app quotes (checked on 11
    ///      November 2026): USDT through WPLS, on V1, as PulseX has no USDT/USDC pool worth the
    ///      name; DAI straight into USDC, here on V2 (both routers have deep DAI/USDC pools).
    function test_fork_buyWithUSDTFromEthereum() public {
        _buyWithBridgedToken("hexnamesusdt", P.USDT, P.PULSEX_V1_ROUTER);
    }

    function test_fork_buyWithDAIFromEthereum() public {
        _buyWithBridgedToken("hexnamesdai", _two(P.DAI, P.USDC), P.PULSEX_V2_ROUTER);
    }

    /// @dev The app approves a little more than a payment needs, and approves again when what's
    ///      left falls short. Ethereum's own USDT refuses to change an allowance straight to another
    ///      one; the bridge's USDT on PulseChain is an ordinary token and must not.
    function test_fork_USDTFromEthereum_changesAnAllowanceLikeAnyToken() public {
        vm.startPrank(alice);
        assertTrue(IERC20(P.USDT).approve(address(hub.checkout), 5e6));
        assertTrue(IERC20(P.USDT).approve(address(hub.checkout), 7e6));
        vm.stopPrank();
        assertEq(IERC20(P.USDT).allowance(alice, address(hub.checkout)), 7e6);
    }

    function _buyWithBridgedToken(string memory label, address token, address router) internal {
        address[] memory path = new address[](3);
        path[0] = token;
        path[1] = P.WPLS;
        path[2] = P.USDC;
        _buyWithBridgedToken(label, path, router);
    }

    function _buyWithBridgedToken(string memory label, address[] memory path, address router) internal {
        address token = path[0];
        AnyTokenCheckout.Registration memory reg = _registration(label, alice);
        _commit(reg);
        (uint256 price, uint256 amountIn) = hub.checkout.quoteRegister(reg.label, reg.duration, router, path);
        amountIn = amountIn * 103 / 100;
        deal(token, alice, amountIn);

        vm.startPrank(alice);
        IERC20(token).approve(address(hub.checkout), amountIn);
        (, uint256 change) = hub.checkout
            .registerWithToken(reg, IERC20(token), amountIn, SwapPayments.Swap(router, path, price, block.timestamp));
        vm.stopPrank();

        assertEq(hub.core.hexRegistry.findOwner(label), alice);
        assertEq(IERC20(P.USDC).balanceOf(alice), change);
        assertEq(IERC20(token).balanceOf(address(hub.checkout)), 0);
        assertEq(IERC20(P.USDC).balanceOf(address(hub.checkout)), 0);
    }

    function test_fork_buyWithPLS_payingTheCopyFee() public {
        vm.prank(admin);
        hub.checkout.setCopyBot(bot);
        vm.prank(bot);
        hub.checkout.setCopyFee(3e6); // Ethereum is busy: $3 to copy at once
        AnyTokenCheckout.Registration memory reg = _registration("hexnamescopyfee", alice);
        _commit(reg);
        (uint256 price, uint256 fee, uint256 plsIn) =
            hub.checkout.quoteRegisterAndCopy(reg.label, reg.duration, P.PULSEX_V2_ROUTER, _path(P.WPLS));
        assertEq(fee, 3e6);
        plsIn = plsIn * 103 / 100;
        vm.deal(alice, plsIn);

        vm.recordLogs();
        vm.prank(alice);
        (, uint256 change, uint256 charged) =
            hub.checkout.registerWithPLSAndCopy{value: plsIn}(reg, _swap(P.PULSEX_V2_ROUTER, P.WPLS, price + fee), fee);

        assertEq(charged, fee);
        assertEq(hub.core.hexRegistry.findOwner("hexnamescopyfee"), alice);
        assertEq(IERC20(P.USDC).balanceOf(beneficiary), price, "the registrar was paid exactly the price");
        assertEq(IERC20(P.USDC).balanceOf(bot), fee, "the bot got the fee");
        assertEq(IERC20(P.USDC).balanceOf(alice), change, "change in USDC");
        assertEq(IERC20(P.USDC).balanceOf(address(hub.checkout)), 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        _assertBridgeMessage(logs, address(hub.mirrorSync), ethMirrorRegistrar, 1_000_000);
        // The fee names the real bridge message it paid for, which the bot then claims first.
        bytes32 messageId;
        bytes32 paidFor;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter == P.AMB && logs[i].topics[0] == USER_REQUEST_FOR_SIGNATURE) {
                messageId = logs[i].topics[1];
            }
            if (logs[i].emitter == address(hub.checkout) && logs[i].topics[0] == AnyTokenCheckout.CopyPaid.selector) {
                paidFor = logs[i].topics[2];
            }
        }
        assertTrue(messageId != bytes32(0));
        assertEq(paidFor, messageId);
    }

    function test_fork_fillAnEthereumOrder() public {
        HexOrderFiller.Reveal memory r = HexOrderFiller.Reveal({
            label: "hexnamesorder",
            owner: alice,
            secret: keccak256("fork secret"),
            subregistry: IRegistry(address(0)),
            resolver: address(0),
            duration: 365 days,
            referrer: bytes32(0)
        });
        bytes32 commitment =
            hub.registrar.makeCommitment(r.label, r.owner, r.secret, r.subregistry, r.resolver, r.duration, r.referrer);
        (uint256 base,) = hub.registrar.getRegisterPrice(r.label, r.duration, IERC20(P.USDC));
        _buyWithPLS(P.USDC, base + 1e6, bot); // the bot's float of bridged USDC
        vm.prank(bot);
        IERC20(P.USDC).approve(address(hub.orderFiller), type(uint256).max);

        hub.registrar.commit(commitment);
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
        uint64 deadline = uint64(block.timestamp + 20 minutes);

        vm.recordLogs();
        vm.prank(bot);
        hub.orderFiller.fill(7, deadline, r, IERC20(P.USDC), bot);

        assertEq(hub.core.hexRegistry.findOwner("hexnamesorder"), alice);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        _assertBridgeMessage(logs, address(hub.orderFiller), ethOrderBook, 300_000);
        _assertBridgeMessage(logs, address(hub.mirrorSync), ethMirrorRegistrar, 1_000_000);
    }

    // ------------------------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------------------------

    /// @dev Checks the real bridge recorded a message from `sender` to `target`. Its message
    ///      layout (AMB v6): messageId (32) | sender (20) | executor (20) | gas (4) | ...
    function _assertBridgeMessage(Vm.Log[] memory logs, address sender, address target, uint256 gas) internal pure {
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter != P.AMB || logs[i].topics[0] != USER_REQUEST_FOR_SIGNATURE) continue;
            bytes memory message = abi.decode(logs[i].data, (bytes));
            if (address(bytes20(_slice(message, 32, 20))) != sender) continue;
            assertEq(address(bytes20(_slice(message, 52, 20))), target, "message target");
            assertEq(uint32(bytes4(_slice(message, 72, 4))), gas, "message gas");
            return;
        }
        revert("no bridge message from the expected sender");
    }

    function _slice(bytes memory data, uint256 start, uint256 length) internal pure returns (bytes memory out) {
        out = new bytes(length);
        for (uint256 i = 0; i < length; ++i) {
            out[i] = data[start + i];
        }
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
        hub.registrar
            .commit(
                hub.registrar
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

    function _swap(address router, address tokenIn, uint256 amountOutMin)
        internal
        view
        returns (SwapPayments.Swap memory)
    {
        return SwapPayments.Swap(router, _path(tokenIn), amountOutMin, block.timestamp);
    }

    function _resolve(string memory name) internal view returns (address) {
        bytes memory dns = NameCoder.encode(name);
        (bytes memory result,) =
            hub.core.universalResolver.resolve(dns, abi.encodeCall(IAddrResolver.addr, (NameCoder.namehash(dns, 0))));
        return abi.decode(result, (address));
    }

    receive() external payable {}
}
