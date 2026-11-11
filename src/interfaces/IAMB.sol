// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice The parts of the official PulseChain bridge's Arbitrary Message Bridge (AMB) used here.
/// @dev TokenBridge AMB, interfaces version 6.2.0, the same contract family as Gnosis Chain's bridge.
///      Home side on PulseChain: 0x6ef79FD6f9f840264332884240539Ed7A2dA8b2b.
///      Foreign side on Ethereum: 0xd0764FAe29E0a6a96fF685f71CfC685456D5636c.
///      Both are signed for by the same 8 validators, 5 of whom must sign each message
///      (checked on-chain on 2026-11-05). Any contract may send a message.
interface IAMB {
    /// @notice Queues a call to `target` on the other chain, run with `gas` gas once validators sign.
    /// @return messageId The bridge's id for the message.
    function requireToPassMessage(address target, bytes calldata data, uint256 gas) external returns (bytes32 messageId);

    /// @notice While a message from the other chain is running: the contract that sent it.
    function messageSender() external view returns (address);

    /// @notice While a message from the other chain is running: the chain it was sent from.
    function messageSourceChainId() external view returns (uint256);

    /// @notice The most gas a message may ask for.
    function maxGasPerTx() external view returns (uint256);
}
