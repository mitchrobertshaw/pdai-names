// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IPermissionedRegistry} from "@ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensv2/registry/libraries/RegistryRolesLib.sol";
import {LibLabel} from "@ensv2/utils/LibLabel.sol";

import {BridgeLink} from "../common/BridgeLink.sol";
import {ZeroAddress} from "../common/Errors.sol";
import {IAMB} from "../interfaces/IAMB.sol";
import {IHexMirrorReceiver} from "../interfaces/IHexBridge.sol";

/// @title HexMirrorRegistrar
/// @notice Keeps the Ethereum copy of .hex in step with PulseChain, where names live.
/// @dev The only writer of the Ethereum .hex registry. It holds that registry's register,
///      unregister and renew roles, and acts only on messages from the linked `HexMirrorSync` on
///      PulseChain, delivered by the official bridge. For each message it makes the Ethereum entry
///      match what PulseChain reported:
///        - same owner, later expiry: the expiry is extended;
///        - new owner: the old entry is removed and a fresh one is made for the new owner, so
///          nothing set by the previous owner on Ethereum carries over;
///        - not registered or expired on PulseChain: the entry is removed.
///      Names on Ethereum cannot be transferred, since ownership follows PulseChain. Their owner can
///      still set a resolver and a subregistry on Ethereum.
///
///      Messages may arrive out of order, so each carries a nonce and older ones are ignored. A
///      message never reverts once it is authenticated, so the bridge never marks one as failed.
contract HexMirrorRegistrar is BridgeLink, IHexMirrorReceiver {
    /// @notice Roles an owner gets on an Ethereum entry: set its resolver and subregistry (and let
    ///         others do so). No transfer role.
    uint256 public constant OWNER_ROLES = RegistryRolesLib.ROLE_SET_SUBREGISTRY
        | RegistryRolesLib.ROLE_SET_SUBREGISTRY_ADMIN | RegistryRolesLib.ROLE_SET_RESOLVER
        | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN;

    /// @notice The Ethereum .hex registry this contract writes.
    IPermissionedRegistry public immutable REGISTRY;

    /// @notice The nonce of the last message applied for each name, by label id.
    mapping(uint256 labelId => uint64 nonce) public lastNonce;

    /// @notice The Ethereum entry for `label` now matches PulseChain.
    event Mirrored(string label, address indexed owner, uint64 expiry, uint64 indexed nonce);
    /// @notice A message older than the last one applied for `label` was ignored.
    event MirrorStale(string label, uint64 indexed nonce, uint64 lastNonce);
    /// @notice The registry refused the new entry (for example, the owner address cannot hold the
    ///         token on Ethereum), so `label` has no Ethereum entry for now.
    event MirrorFailed(string label, address indexed owner, uint64 indexed nonce, bytes reason);

    /// @param amb The bridge's message contract on Ethereum.
    /// @param pulseChainId The chain id of PulseChain (369).
    /// @param linker Who may set the PulseChain `HexMirrorSync`, once.
    /// @param registry The Ethereum .hex registry.
    constructor(IAMB amb, uint256 pulseChainId, address linker, IPermissionedRegistry registry)
        BridgeLink(amb, pulseChainId, linker)
    {
        if (address(registry) == address(0)) revert ZeroAddress();
        REGISTRY = registry;
    }

    /// @inheritdoc IHexMirrorReceiver
    function mirror(string calldata label, address owner, uint64 expiry, uint64 nonce) external onlyPeerMessage {
        uint256 labelId = LibLabel.id(label);
        uint64 last = lastNonce[labelId];
        if (nonce <= last) {
            emit MirrorStale(label, nonce, last);
            return;
        }
        lastNonce[labelId] = nonce;

        bool live = owner != address(0) && expiry > block.timestamp;
        IPermissionedRegistry.State memory state = REGISTRY.getState(labelId);
        // The same owner, no earlier expiry: extend the copy, keeping any settings its owner made on
        // Ethereum. That includes a copy that has lapsed here, as when its owner renews during the
        // grace period (this contract's root ROLE_RENEW lets it revive the entry).
        if (live && state.latestOwner == owner && expiry >= state.expiry) {
            if (expiry > state.expiry) REGISTRY.renew(labelId, expiry);
            emit Mirrored(label, owner, expiry, nonce);
            return;
        }
        if (state.status != IPermissionedRegistry.Status.AVAILABLE) REGISTRY.unregister(labelId);
        if (!live) {
            emit Mirrored(label, address(0), expiry, nonce);
            return;
        }
        try REGISTRY.register(label, owner, IRegistry(address(0)), address(0), OWNER_ROLES, expiry) {
            emit Mirrored(label, owner, expiry, nonce);
        } catch (bytes memory reason) {
            emit MirrorFailed(label, owner, nonce, reason);
        }
    }
}
