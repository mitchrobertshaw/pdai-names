// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";

import {HexDeployer} from "../../script/HexDeployer.sol";
import {EthereumAddresses as E} from "../../script/Addresses.sol";
import {BridgeLink} from "../../src/common/BridgeLink.sol";
import {SwapPayments} from "../../src/common/SwapPayments.sol";
import {HexOrderBook} from "../../src/ethereum/HexOrderBook.sol";
import {IAMB} from "../../src/interfaces/IAMB.sol";

interface IUniswapV2Router {
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts);
}

/// @notice The Ethereum side against a live copy of Ethereum: the real bridge contract, USDC, WETH,
///         HEX and Uniswap V2. A bridge delivery is simulated by calling as the real bridge contract
///         with its "who sent this" answers set, since only the validators can produce real ones.
contract EthereumForkTest is Test, HexDeployer {
    Mirror internal mirror;
    address internal admin = makeAddr("hex-names fork admin"); // Foundry's makeAddr("admin") has code on mainnet (EIP-7702)
    address internal alice = makeAddr("hex-names fork buyer");
    address internal bot = makeAddr("bot");
    address internal plsMirrorSync = makeAddr("PulseChain HexMirrorSync");
    address internal plsOrderFiller = makeAddr("PulseChain HexOrderFiller");

    function setUp() public {
        vm.createSelectFork(vm.envOr("ETHEREUM_RPC_URL", string("https://ethereum-rpc.publicnode.com")));
        // Public RPCs are groups of nodes that can briefly disagree about the newest block. Step
        // back to a block they have all settled on.
        vm.rollFork(block.number - 16);
        address[] memory routers = new address[](1);
        routers[0] = E.UNISWAP_V2_ROUTER;
        mirror = _deployMirror(
            MirrorConfig({
                deployer: address(this),
                admin: admin,
                amb: IAMB(E.AMB),
                pulsechainChainId: PULSECHAIN_CHAIN_ID,
                usdc: IERC20(E.USDC),
                weth: IERC20(E.WETH),
                routers: routers,
                fillWindow: 30 minutes,
                reclaimDelay: 6 hours
            })
        );
        mirror.mirrorRegistrar.link(plsMirrorSync);
        mirror.orderBook.link(plsOrderFiller);
    }

    function test_fork_orderWithUSDC_settledByTheBridge() public {
        uint256 amount = 10.25e6; // the price plus the filler's fee
        deal(E.USDC, alice, amount);
        vm.startPrank(alice);
        IERC20(E.USDC).approve(address(mirror.orderBook), amount);
        uint256 orderId = mirror.orderBook.placeOrder(keccak256("commitment"), amount, hex"c0ffee");
        vm.stopPrank();
        (,,, uint64 deadline,) = mirror.orderBook.orders(orderId);

        _asBridgeMessageFrom(plsOrderFiller);
        mirror.orderBook.settle(orderId, keccak256("commitment"), deadline, bot, true);
        vm.clearMockedCalls();

        assertEq(IERC20(E.USDC).balanceOf(bot), amount, "the filler was paid in real USDC");
    }

    function test_fork_orderWithETH() public {
        uint256 amount = 10.25e6; // the price plus the filler's fee
        address[] memory path = _two(E.WETH, E.USDC);
        uint256 ethIn = mirror.orderBook.quote(amount, E.UNISWAP_V2_ROUTER, path) * 103 / 100;
        vm.deal(alice, ethIn);
        vm.prank(alice);
        (uint256 orderId, uint256 change) = mirror.orderBook.placeOrderWithETH{value: ethIn}(
            keccak256("commitment"),
            amount,
            hex"",
            SwapPayments.Swap(E.UNISWAP_V2_ROUTER, path, amount, block.timestamp)
        );
        assertEq(IERC20(E.USDC).balanceOf(address(mirror.orderBook)), amount);
        assertEq(IERC20(E.USDC).balanceOf(alice), change);
        assertEq(orderId, 1);
    }

    function test_fork_orderWithHEX() public {
        uint256 amount = 10.25e6; // the price plus the filler's fee
        address[] memory path = new address[](3);
        path[0] = E.HEX;
        path[1] = E.WETH;
        path[2] = E.USDC;
        uint256 hexIn = mirror.orderBook.quote(amount, E.UNISWAP_V2_ROUTER, path) * 103 / 100;
        vm.deal(address(this), 10 ether);
        IUniswapV2Router(E.UNISWAP_V2_ROUTER).swapExactETHForTokens{value: 1 ether}(
            hexIn, _two(E.WETH, E.HEX), alice, block.timestamp
        );
        vm.startPrank(alice);
        IERC20(E.HEX).approve(address(mirror.orderBook), hexIn);
        mirror.orderBook
            .placeOrderWithToken(
                keccak256("commitment"),
                amount,
                hex"",
                IERC20(E.HEX),
                hexIn,
                SwapPayments.Swap(E.UNISWAP_V2_ROUTER, path, amount, block.timestamp)
            );
        vm.stopPrank();
        assertEq(IERC20(E.USDC).balanceOf(address(mirror.orderBook)), amount);
        assertEq(IERC20(E.HEX).balanceOf(address(mirror.orderBook)), 0);
    }

    function test_fork_copyWrittenByTheBridge_resolvesOnEthereum() public {
        _asBridgeMessageFrom(plsMirrorSync);
        mirror.mirrorRegistrar.mirror("hexnamesfork", alice, uint64(block.timestamp + 365 days), 1);
        vm.clearMockedCalls();

        assertEq(mirror.core.hexRegistry.findOwner("hexnamesfork"), alice);
        bytes memory dns = NameCoder.encode("hexnamesfork.hex");
        (bytes memory result,) =
            mirror.core.universalResolver.resolve(dns, abi.encodeCall(IAddrResolver.addr, (NameCoder.namehash(dns, 0))));
        assertEq(abi.decode(result, (address)), alice);
    }

    function test_fork_realBridgeWithoutAMessageIsRejected() public {
        // Outside a delivery the real bridge reports no sender, so even a call from its own address fails.
        vm.prank(E.AMB);
        vm.expectRevert(BridgeLink.NotFromPeer.selector);
        mirror.mirrorRegistrar.mirror("hexnamesfork", alice, uint64(block.timestamp + 365 days), 1);
    }

    /// @dev Makes the next call come from the real bridge contract, reporting a message from `sender`
    ///      on PulseChain, as it does while it executes a validator-signed message.
    function _asBridgeMessageFrom(address sender) internal {
        vm.mockCall(E.AMB, abi.encodeCall(IAMB.messageSender, ()), abi.encode(sender));
        vm.mockCall(E.AMB, abi.encodeCall(IAMB.messageSourceChainId, ()), abi.encode(PULSECHAIN_CHAIN_ID));
        vm.prank(E.AMB);
    }

    function _two(address a, address b) internal pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = a;
        path[1] = b;
    }

    receive() external payable {}
}
