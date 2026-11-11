// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IExtendedResolver} from "@ens/contracts/resolvers/profiles/IExtendedResolver.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "@ens/contracts/resolvers/profiles/IAddressResolver.sol";
import {IHasAddressResolver} from "@ens/contracts/resolvers/profiles/IHasAddressResolver.sol";
import {COIN_TYPE_ETH, COIN_TYPE_DEFAULT} from "@ens/contracts/utils/ENSIP19.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {LibRegistry} from "@ensv2/universalResolver/libraries/LibRegistry.sol";

/// @title OwnerResolver
/// @notice The default resolver for .hex: a name resolves to its owner's address, on Ethereum and
///         on PulseChain, from the moment it is registered.
/// @dev Set as the resolver of `hex` in the root registry. ENSv2 lookups use the closest resolver
///      above a name, so every .hex name without a resolver of its own falls back to this one
///      (ENSIP-10). Owners who want other records point their name at their own resolver.
///
///      Only the coin types for Ethereum (60), PulseChain (ENSIP-11) and the default EVM address
///      (ENSIP-19) are answered. A wallet that is a smart contract may not control the same address
///      on the other chain, so such owners should set their own resolver.
contract OwnerResolver is ERC165, IExtendedResolver {
    /// @notice ENSIP-11 coin type for PulseChain (chain id 369).
    uint256 public constant COIN_TYPE_PULSECHAIN = COIN_TYPE_DEFAULT | 369;

    /// @notice The root registry names are looked up from.
    IRegistry public immutable ROOT_REGISTRY;

    /// @notice The record asked for is not one this resolver answers.
    error UnsupportedResolverProfile(bytes4 selector);

    constructor(IRegistry rootRegistry) {
        ROOT_REGISTRY = rootRegistry;
    }

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @notice ENSIP-10 entry point. Answers `addr(node)`, `addr(node, coinType)` and
    ///         `hasAddr(node, coinType)` with the current owner of `name`.
    /// @param name The DNS-encoded name.
    /// @param data The ABI-encoded record call.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        bytes4 selector = bytes4(data);
        if (selector == IAddrResolver.addr.selector) {
            return abi.encode(ownerOf(name));
        }
        if (selector == IAddressResolver.addr.selector) {
            (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            address owner = isServedCoinType(coinType) ? ownerOf(name) : address(0);
            return abi.encode(owner == address(0) ? new bytes(0) : abi.encodePacked(owner));
        }
        if (selector == IHasAddressResolver.hasAddr.selector) {
            (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            return abi.encode(isServedCoinType(coinType) && ownerOf(name) != address(0));
        }
        revert UnsupportedResolverProfile(selector);
    }

    /// @notice The current owner of the DNS-encoded `name`, or zero if it is not registered.
    function ownerOf(bytes calldata name) public view returns (address) {
        return LibRegistry.findOwner(ROOT_REGISTRY, name, 0);
    }

    /// @notice Whether `coinType` is answered with the owner's address.
    function isServedCoinType(uint256 coinType) public pure returns (bool) {
        return coinType == COIN_TYPE_ETH || coinType == COIN_TYPE_DEFAULT || coinType == COIN_TYPE_PULSECHAIN;
    }
}
