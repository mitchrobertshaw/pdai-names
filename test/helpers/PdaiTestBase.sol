// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";

import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "@ens/contracts/resolvers/profiles/IAddressResolver.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {LibLabel} from "@ensv2/utils/LibLabel.sol";

import {PdaiDeployer} from "../../script/PdaiDeployer.sol";
import {ReservedName} from "../../script/ReservedNames.sol";
import {AnyTokenCheckout} from "../../src/AnyTokenCheckout.sol";
import {SwapPayments} from "../../src/SwapPayments.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";
import {MockWrappedNative} from "../mocks/MockWrappedNative.sol";

/// @notice The full .pdai deployment on a stand-in PulseChain, deployed with the same
///         `PdaiDeployer` the deploy script uses.
abstract contract PdaiTestBase is Test, PdaiDeployer {
    uint64 internal constant ONE_YEAR = 365 days;

    MockERC20 internal plsUsdc; // USDC bridged from Ethereum, 6 decimals
    MockERC20 internal plsDai; // DAI bridged from Ethereum, 18 decimals
    MockERC20 internal pHex; // HEX on PulseChain, 8 decimals
    MockWrappedNative internal wpls;
    MockSwapRouter internal pulsex;

    Deployment internal deployed;

    address internal admin = makeAddr("admin");
    address internal beneficiary = makeAddr("beneficiary");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public virtual {
        vm.warp(1_800_000_000); // early 2027

        plsUsdc = new MockERC20("USD Coin from Ethereum", "USDC", 6);
        plsDai = new MockERC20("Dai Stablecoin from Ethereum", "DAI", 18);
        pHex = new MockERC20("HEX", "HEX", 8);
        wpls = new MockWrappedNative("Wrapped Pulse", "WPLS");
        pulsex = new MockSwapRouter();
        pulsex.setRate(address(wpls), address(plsUsdc), 0.00002e6); // 1 PLS = $0.00002 (in 6-decimal units per 1e18 wei)
        pulsex.setRate(address(pHex), address(plsUsdc), 0.004e6 * 1e10); // 1 HEX (1e8) = $0.004

        address[] memory routers = new address[](1);
        routers[0] = address(pulsex);
        deployed = _deploy(
            Config({
                deployer: address(this),
                admin: admin,
                beneficiary: beneficiary,
                usdc: plsUsdc,
                dai: plsDai,
                wpls: wpls,
                routers: routers,
                reserved: _reservedNames()
            })
        );
    }

    /// @dev Names to set aside at deployment. None, unless a test overrides this.
    function _reservedNames() internal virtual returns (ReservedName[] memory names) {}

    // ------------------------------------------------------------------------------------------
    // Registering
    // ------------------------------------------------------------------------------------------

    /// @dev A registration with a secret made from its label and owner, resolving to its owner.
    function _registration(string memory label, address owner, uint64 duration)
        internal
        pure
        returns (AnyTokenCheckout.Registration memory r)
    {
        r = AnyTokenCheckout.Registration({
            label: label,
            owner: owner,
            secret: keccak256(abi.encode("secret", label, owner)),
            subregistry: IRegistry(address(0)),
            resolver: address(0),
            duration: duration,
            referrer: bytes32(0)
        });
    }

    function _commitmentOf(AnyTokenCheckout.Registration memory r) internal view returns (bytes32) {
        return deployed.registrar
            .makeCommitment(r.label, r.owner, r.secret, r.subregistry, r.resolver, r.duration, r.referrer);
    }

    /// @dev Commits `r` on the registrar and waits until it may be used.
    function _commit(AnyTokenCheckout.Registration memory r) internal returns (bytes32 commitment) {
        commitment = _commitmentOf(r);
        deployed.registrar.commit(commitment);
        vm.warp(block.timestamp + MIN_COMMITMENT_AGE);
    }

    /// @dev Registers `label`.pdai to `owner` straight through the registrar, paying in USDC.
    function _registerDirect(string memory label, address owner, uint64 duration) internal returns (uint256 tokenId) {
        AnyTokenCheckout.Registration memory r = _registration(label, owner, duration);
        _commit(r);
        (uint256 base, uint256 premium) = deployed.registrar.getRegisterPrice(label, duration, plsUsdc);
        plsUsdc.mint(owner, base + premium);
        vm.startPrank(owner);
        plsUsdc.approve(address(deployed.registrar), base + premium);
        tokenId = deployed.registrar
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

    /// @dev Looks up `name`'s address for `coinType` through the UniversalResolver.
    function _resolveAddr(string memory name, uint256 coinType) internal view returns (address) {
        (bytes memory result,) = deployed.universalResolver
            .resolve(_dns(name), abi.encodeCall(IAddressResolver.addr, (_node(name), coinType)));
        bytes memory raw = abi.decode(result, (bytes));
        return raw.length == 0 ? address(0) : address(bytes20(raw));
    }

    /// @dev Looks up `name`'s address the classic way, `addr(node)`: coin type 60, which wallets
    ///      ask for by default.
    function _resolveEthAddr(string memory name) internal view returns (address) {
        (bytes memory result,) =
            deployed.universalResolver.resolve(_dns(name), abi.encodeCall(IAddrResolver.addr, (_node(name))));
        return abi.decode(result, (address));
    }

    function _labelId(string memory label) internal pure returns (uint256) {
        return LibLabel.id(label);
    }

    function _noSwap() internal pure returns (SwapPayments.Swap memory s) {}
}
