// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice WETH9-style wrapper for a chain's native coin: WPLS on PulseChain, WETH on Ethereum.
///         Only `deposit` is needed here; balances and approvals use the standard ERC-20 interface.
interface IWrappedNative {
    /// @notice Wraps the coins sent with the call into the same amount of the wrapped token.
    function deposit() external payable;
}
