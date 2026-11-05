// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice The parts of an ENSv2-style registrar that the checkout calls.
/// @dev Mirrors `ETHRegistrar` and `AbstractETHRegistrar` in ensdomains/contracts-v2.
///      There, `subregistry` is typed `IRegistry` and `paymentToken` is typed `IERC20`. Contract
///      types are plain addresses in the ABI, so the function selectors are the same.
interface IRegistrarLike {
    /// @notice Registers `label` to `owner`, completing an earlier commitment.
    /// @dev Pulls the price from `msg.sender` in `paymentToken`.
    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        IERC20 paymentToken,
        bytes32 referrer
    ) external returns (uint256 tokenId);

    /// @notice Extends `label` by `duration` seconds.
    /// @dev Pulls the price from `msg.sender` in `paymentToken`.
    function renew(string calldata label, uint64 duration, IERC20 paymentToken, bytes32 referrer) external;

    /// @notice Price to register `label` for `duration` seconds: a base price plus any premium
    ///         for a name that only recently expired.
    function getRegisterPrice(string calldata label, uint64 duration, IERC20 paymentToken)
        external
        view
        returns (uint256 base, uint256 premium);

    /// @notice Price to extend `label` by `duration` seconds.
    function getRenewPrice(string calldata label, uint64 duration, IERC20 paymentToken)
        external
        view
        returns (uint256);
}
