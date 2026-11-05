// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Wrapped PLS (WETH9-style). Only `deposit` is needed here; balances and approvals
///         go through the standard ERC-20 interface.
interface IWPLS {
    /// @notice Wraps the PLS sent with the call into the same amount of WPLS for `msg.sender`.
    function deposit() external payable;
}
