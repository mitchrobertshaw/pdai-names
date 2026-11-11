// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IPermissionedRegistry} from "@ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {LibLabel} from "@ensv2/utils/LibLabel.sol";

import {BridgeLink} from "../common/BridgeLink.sol";
import {ZeroAddress} from "../common/Errors.sol";
import {IAMB} from "../interfaces/IAMB.sol";
import {IHexMirrorReceiver, IHexMirrorSync} from "../interfaces/IHexBridge.sol";

/// @title HexMirrorSync
/// @notice Copies .hex names from PulseChain, where they live, to Ethereum.
/// @dev Anyone may call `sync` for any name. It reads the name's owner and expiry from the
///      PulseChain registry and sends them over the official bridge to `HexMirrorRegistrar` on
///      Ethereum, which writes them into the Ethereum copy of the registry. A message can only
///      ever report what PulseChain says, so calling it more often than needed does no harm.
///
///      Every message carries a nonce that only goes up, so if messages arrive on Ethereum out of
///      order the older ones are ignored there.
contract HexMirrorSync is BridgeLink, IHexMirrorSync {
    /// @notice The .hex registry on PulseChain.
    IPermissionedRegistry public immutable REGISTRY;

    /// @notice Gas each message asks for on Ethereum.
    uint256 public immutable MIRROR_GAS;

    /// @notice The nonce of the last message sent.
    uint64 public nonce;

    /// @notice The state of `label`.hex was sent to Ethereum.
    event Synced(string label, address indexed owner, uint64 expiry, uint64 indexed nonce, bytes32 indexed messageId);

    /// @notice `label` is empty or longer than a DNS label may be.
    error InvalidLabel();
    /// @notice `mirrorGas` is more than the bridge allows.
    error GasTooHigh(uint256 gas, uint256 max);

    /// @param amb The bridge's message contract on PulseChain.
    /// @param ethereumChainId The chain id of Ethereum (1).
    /// @param linker Who may set the Ethereum `HexMirrorRegistrar`, once.
    /// @param registry The .hex registry on PulseChain.
    /// @param mirrorGas Gas each message asks for on Ethereum.
    constructor(IAMB amb, uint256 ethereumChainId, address linker, IPermissionedRegistry registry, uint256 mirrorGas)
        BridgeLink(amb, ethereumChainId, linker)
    {
        if (address(registry) == address(0)) revert ZeroAddress();
        uint256 max = amb.maxGasPerTx();
        if (mirrorGas > max) revert GasTooHigh(mirrorGas, max);
        REGISTRY = registry;
        MIRROR_GAS = mirrorGas;
    }

    /// @inheritdoc IHexMirrorSync
    function sync(string calldata label) external returns (bytes32 messageId) {
        uint256 length = bytes(label).length;
        if (length == 0 || length > 255) revert InvalidLabel();
        IPermissionedRegistry.State memory state = REGISTRY.getState(LibLabel.id(label));
        address owner = state.status == IPermissionedRegistry.Status.REGISTERED ? state.latestOwner : address(0);
        uint64 n = ++nonce;
        messageId = _sendToPeer(abi.encodeCall(IHexMirrorReceiver.mirror, (label, owner, state.expiry, n)), MIRROR_GAS);
        emit Synced(label, owner, state.expiry, n, messageId);
    }
}
