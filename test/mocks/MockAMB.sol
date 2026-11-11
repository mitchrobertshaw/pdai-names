// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IAMB} from "../../src/interfaces/IAMB.sol";

/// @notice Stand-in for one side of the bridge's message contract, so both chains can run in one
///         test. Messages sent through one `MockAMB` are delivered by calling `deliver` on the
///         `MockAMB` standing in for the other chain. Like the real bridge, a delivered call that
///         reverts does not revert the delivery; it is recorded as failed.
contract MockAMB is IAMB {
    struct Message {
        address sender;
        address target;
        bytes data;
        uint256 gas;
        bool delivered;
    }

    /// @notice The chain this side stands for.
    uint256 public immutable CHAIN_ID;

    uint256 public maxGasPerTx = 2_000_000;

    Message[] internal _outbox;

    address internal _messageSender;
    uint256 internal _messageSourceChainId;

    /// @notice Gas used by the last delivered call itself, not counting this contract's overhead.
    uint256 public lastGasUsed;

    event Sent(uint256 indexed index, address indexed sender, address indexed target, uint256 gas);
    event Delivered(uint256 indexed index, bool ok);

    constructor(uint256 chainId) {
        CHAIN_ID = chainId;
    }

    function requireToPassMessage(address target, bytes calldata data, uint256 gas) external returns (bytes32) {
        require(gas <= maxGasPerTx, "MockAMB: gas too high");
        _outbox.push(Message(msg.sender, target, data, gas, false));
        emit Sent(_outbox.length - 1, msg.sender, target, gas);
        return bytes32(_outbox.length - 1);
    }

    function messageSender() external view returns (address) {
        return _messageSender;
    }

    function messageSourceChainId() external view returns (uint256) {
        return _messageSourceChainId;
    }

    function outboxLength() external view returns (uint256) {
        return _outbox.length;
    }

    function outbox(uint256 index) external view returns (Message memory) {
        return _outbox[index];
    }

    function markDelivered(uint256 index) external {
        require(!_outbox[index].delivered, "MockAMB: already delivered");
        _outbox[index].delivered = true;
    }

    /// @notice Delivers message `index` sent through `from` (the other chain), on this chain.
    function deliver(MockAMB from, uint256 index) public returns (bool ok, bytes memory ret) {
        Message memory m = from.outbox(index);
        from.markDelivered(index);
        (ok, ret) = _execute(m.target, m.data, m.gas, m.sender, from.CHAIN_ID());
        emit Delivered(index, ok);
    }

    /// @notice Delivers every undelivered message sent through `from`, oldest first.
    function deliverAll(MockAMB from) external returns (uint256 count) {
        uint256 n = from.outboxLength();
        for (uint256 i = 0; i < n; ++i) {
            if (!from.outbox(i).delivered) {
                deliver(from, i);
                ++count;
            }
        }
    }

    /// @notice Runs a call as if the bridge were delivering a message from `sender` on
    ///         `sourceChainId`. For tests of what a receiver accepts.
    function deliverForged(address target, bytes calldata data, address sender, uint256 sourceChainId)
        external
        returns (bool ok, bytes memory ret)
    {
        return _execute(target, data, maxGasPerTx, sender, sourceChainId);
    }

    function _execute(address target, bytes memory data, uint256 gas, address sender, uint256 sourceChainId)
        internal
        returns (bool ok, bytes memory ret)
    {
        _messageSender = sender;
        _messageSourceChainId = sourceChainId;
        uint256 start = gasleft();
        (ok, ret) = target.call{gas: gas}(data);
        lastGasUsed = start - gasleft();
        _messageSender = address(0);
        _messageSourceChainId = 0;
    }
}
