// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice The two messages PulseChain sends to Ethereum over the bridge.

/// @notice Received by `HexOrderBook` on Ethereum, sent by `HexOrderFiller` on PulseChain.
interface IHexOrderSettlement {
    /// @notice Closes an Ethereum order. `filled` true pays `payee`, false refunds the buyer.
    /// @param orderId The order's id in `HexOrderBook`.
    /// @param commitment The registrar commitment the order was placed with.
    /// @param deadline The order's fill deadline.
    function settle(uint256 orderId, bytes32 commitment, uint64 deadline, address payee, bool filled) external;
}

/// @notice Received by `HexMirrorRegistrar` on Ethereum, sent by `HexMirrorSync` on PulseChain.
interface IHexMirrorReceiver {
    /// @notice Copies the PulseChain state of `label`.hex: its owner (zero if not registered) and
    ///         expiry. `nonce` increases with every message, so stale ones can be ignored.
    function mirror(string calldata label, address owner, uint64 expiry, uint64 nonce) external;
}

/// @notice `HexMirrorSync` on PulseChain.
interface IHexMirrorSync {
    /// @notice Sends the current PulseChain state of `label`.hex to Ethereum.
    function sync(string calldata label) external returns (bytes32 messageId);
}
