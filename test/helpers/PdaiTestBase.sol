// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "@ens/contracts/resolvers/profiles/IAddressResolver.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {LibLabel} from "@ensv2/utils/LibLabel.sol";

import {HexDeployer} from "../../script/HexDeployer.sol";
import {ReservedName} from "../../script/ReservedNames.sol";
import {SwapPayments} from "../../src/common/SwapPayments.sol";
import {HexOrderFiller} from "../../src/pulsechain/HexOrderFiller.sol";
import {MockAMB} from "../mocks/MockAMB.sol";
import {MockBlockableERC20} from "../mocks/MockBlockableERC20.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";
import {MockWrappedNative} from "../mocks/MockWrappedNative.sol";

/// @notice Both chains in one test: the full .hex deployment on "PulseChain" and on "Ethereum",
///         deployed with the same `HexDeployer` the scripts use, joined by a pair of `MockAMB`s.
abstract contract HexTestBase is Test, HexDeployer {
    uint64 internal constant FILL_WINDOW = 30 minutes;
    uint64 internal constant RECLAIM_DELAY = 6 hours;
    uint256 internal constant MIRROR_GAS = 1_000_000;
    uint256 internal constant SETTLE_GAS = 300_000;
    uint64 internal constant ONE_YEAR = 365 days;

    // Bridge
    MockAMB internal homeAmb; // PulseChain side
    MockAMB internal foreignAmb; // Ethereum side

    // PulseChain tokens
    MockERC20 internal plsUsdc; // USDC bridged from Ethereum, 6 decimals
    MockERC20 internal plsDai; // DAI bridged from Ethereum, 18 decimals
    MockERC20 internal pHex; // HEX on PulseChain, 8 decimals
    MockWrappedNative internal wpls;
    MockSwapRouter internal pulsex;

    // Ethereum tokens
    MockBlockableERC20 internal ethUsdc;
    MockERC20 internal eHex;
    MockWrappedNative internal weth;
    MockSwapRouter internal uniswap;

    Hub internal hub;
    Mirror internal mirror;

    address internal admin = makeAddr("admin");
    address internal beneficiary = makeAddr("beneficiary");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal bot = makeAddr("bot");

    function setUp() public virtual {
        vm.warp(1_800_000_000); // early 2027

        homeAmb = new MockAMB(PULSECHAIN_CHAIN_ID);
        foreignAmb = new MockAMB(ETHEREUM_CHAIN_ID);

        plsUsdc = new MockERC20("USD Coin from Ethereum", "USDC", 6);
        plsDai = new MockERC20("Dai Stablecoin from Ethereum", "DAI", 18);
        pHex = new MockERC20("HEX", "HEX", 8);
        wpls = new MockWrappedNative("Wrapped Pulse", "WPLS");
        pulsex = new MockSwapRouter();
        pulsex.setRate(address(wpls), address(plsUsdc), 0.00002e6); // 1 PLS = $0.00002 (in 6-decimal units per 1e18 wei)
        pulsex.setRate(address(pHex), address(plsUsdc), 0.004e6 * 1e10); // 1 HEX (1e8) = $0.004

        ethUsdc = new MockBlockableERC20("USD Coin", "USDC", 6);
        eHex = new MockERC20("HEX", "HEX", 8);
        weth = new MockWrappedNative("Wrapped Ether", "WETH");
        uniswap = new MockSwapRouter();
        uniswap.setRate(address(weth), address(ethUsdc), 3500e6); // 1 ETH = $3,500
        uniswap.setRate(address(eHex), address(ethUsdc), 0.005e6 * 1e10); // 1 HEX = $0.005

        address[] memory plsRouters = new address[](1);
        plsRouters[0] = address(pulsex);
        hub = _deployHub(
            HubConfig({
                deployer: address(this),
                admin: admin,
                beneficiary: beneficiary,
                amb: homeAmb,
                ethereumChainId: ETHEREUM_CHAIN_ID,
                usdc: plsUsdc,
                dai: plsDai,
                wpls: wpls,
                routers: plsRouters,
                mirrorGas: MIRROR_GAS,
                settleGas: SETTLE_GAS,
                reserved: _reservedNames()
            })
        );

        address[] memory ethRouters = new address[](1);
        ethRouters[0] = address(uniswap);
        mirror = _deployMirror(
            MirrorConfig({
                deployer: address(this),
                admin: admin,
                amb: foreignAmb,
                pulsechainChainId: PULSECHAIN_CHAIN_ID,
                usdc: ethUsdc,
                weth: weth,
                routers: ethRouters,
                fillWindow: FILL_WINDOW,
                reclaimDelay: RECLAIM_DELAY
            })
        );

        hub.mirrorSync.link(address(mirror.mirrorRegistrar));
        hub.orderFiller.link(address(mirror.orderBook));
        mirror.mirrorRegistrar.link(address(hub.mirrorSync));
        mirror.orderBook.link(address(hub.orderFiller));
    }

    /// @dev Names to set aside at deployment. None, unless a test overrides this.
    function _reservedNames() internal virtual returns (ReservedName[] memory names) {}

    // ------------------------------------------------------------------------------------------
    // Bridge
    // ------------------------------------------------------------------------------------------

    /// @dev Delivers every PulseChain message waiting for Ethereum.
    function _relayToEthereum() internal returns (uint256) {
        return foreignAmb.deliverAll(homeAmb);
    }

    // ------------------------------------------------------------------------------------------
    // Registering on PulseChain
    // ------------------------------------------------------------------------------------------

    function _reveal(string memory label, address owner, uint64 duration)
        internal
        pure
        returns (HexOrderFiller.Reveal memory r)
    {
        r = HexOrderFiller.Reveal({
            label: label,
            owner: owner,
            secret: keccak256(abi.encode("secret", label, owner)),
            subregistry: IRegistry(address(0)),
            resolver: address(0),
            duration: duration,
            referrer: bytes32(0)
        });
    }

    function _commitmentOf(HexOrderFiller.Reveal memory r) internal view returns (bytes32) {
        return
            hub.registrar.makeCommitment(r.label, r.owner, r.secret, r.subregistry, r.resolver, r.duration, r.referrer);
    }

    /// @dev Commits `r` on the registrar and waits until it may be used.
    function _commit(HexOrderFiller.Reveal memory r) internal returns (bytes32 commitment) {
        commitment = _commitmentOf(r);
        hub.registrar.commit(commitment);
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
    }

    /// @dev Registers `label`.hex to `owner` straight through the registrar, paying in USDC.
    function _registerDirect(string memory label, address owner, uint64 duration) internal returns (uint256 tokenId) {
        HexOrderFiller.Reveal memory r = _reveal(label, owner, duration);
        _commit(r);
        (uint256 base, uint256 premium) = hub.registrar.getRegisterPrice(label, duration, plsUsdc);
        plsUsdc.mint(owner, base + premium);
        vm.startPrank(owner);
        plsUsdc.approve(address(hub.registrar), base + premium);
        tokenId = hub.registrar
            .register(r.label, r.owner, r.secret, r.subregistry, r.resolver, r.duration, plsUsdc, r.referrer);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------------------------------
    // Looking names up
    // ------------------------------------------------------------------------------------------

    function _dns(string memory name) internal pure returns (bytes memory) {
        return NameCoder.encode(name);
    }

    function _node(string memory name) internal pure returns (bytes32) {
        return NameCoder.namehash(NameCoder.encode(name), 0);
    }

    /// @dev Looks up `name`'s address for `coinType` through a chain's UniversalResolver.
    function _resolveAddr(Core memory core, string memory name, uint256 coinType) internal view returns (address) {
        (bytes memory result,) =
            core.universalResolver.resolve(_dns(name), abi.encodeCall(IAddressResolver.addr, (_node(name), coinType)));
        bytes memory raw = abi.decode(result, (bytes));
        return raw.length == 0 ? address(0) : address(bytes20(raw));
    }

    /// @dev Looks up `name`'s Ethereum address the classic way, `addr(node)`.
    function _resolveEthAddr(Core memory core, string memory name) internal view returns (address) {
        (bytes memory result,) =
            core.universalResolver.resolve(_dns(name), abi.encodeCall(IAddrResolver.addr, (_node(name))));
        return abi.decode(result, (address));
    }

    function _labelId(string memory label) internal pure returns (uint256) {
        return LibLabel.id(label);
    }

    function _noSwap() internal pure returns (SwapPayments.Swap memory s) {}
}
