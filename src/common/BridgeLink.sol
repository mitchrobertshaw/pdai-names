// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IAMB} from "../interfaces/IAMB.sol";
import {ZeroAddress} from "./Errors.sol";

/// @title BridgeLink
/// @notice Pairs a contract with one contract on the other chain, over the official PulseChain bridge.
/// @dev Each side needs the other's address, so neither can take it as a constructor argument.
///      `LINKER` sets it once with `link`, and after that nothing can change it.
abstract contract BridgeLink {
    /// @notice The bridge's message contract on this chain.
    IAMB public immutable AMB;

    /// @notice The chain the paired contract is on.
    uint256 public immutable PEER_CHAIN_ID;

    /// @notice The only account that may call `link`, once.
    address public immutable LINKER;

    /// @notice The paired contract on the other chain, or zero until linked.
    address public peer;

    /// @notice The paired contract was set.
    event Linked(address indexed peer);

    /// @notice `link` was called by someone other than `LINKER`.
    error NotLinker();
    /// @notice `link` was already called.
    error AlreadyLinked();
    /// @notice A message needed the paired contract before it was set.
    error NotLinked();
    /// @notice The call did not come from the paired contract through the bridge.
    error NotFromPeer();

    constructor(IAMB amb, uint256 peerChainId, address linker) {
        if (address(amb) == address(0) || linker == address(0)) revert ZeroAddress();
        AMB = amb;
        PEER_CHAIN_ID = peerChainId;
        LINKER = linker;
    }

    /// @notice Sets the paired contract on the other chain. Can only be done once, by `LINKER`.
    function link(address peer_) external {
        if (msg.sender != LINKER) revert NotLinker();
        if (peer != address(0)) revert AlreadyLinked();
        if (peer_ == address(0)) revert ZeroAddress();
        peer = peer_;
        emit Linked(peer_);
    }

    /// @dev Lets a call through only if the bridge is delivering a message the paired contract
    ///      sent from the paired chain.
    modifier onlyPeerMessage() {
        address p = peer;
        if (
            msg.sender != address(AMB) || p == address(0) || AMB.messageSender() != p
                || AMB.messageSourceChainId() != PEER_CHAIN_ID
        ) {
            revert NotFromPeer();
        }
        _;
    }

    /// @dev Sends `data` to the paired contract, to be run with `gas` gas.
    function _sendToPeer(bytes memory data, uint256 gas) internal returns (bytes32 messageId) {
        address p = peer;
        if (p == address(0)) revert NotLinked();
        return AMB.requireToPassMessage(p, data, gas);
    }
}
