// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice The parts of a Uniswap-V2-style router that the checkouts call.
/// @dev PulseX V1 (0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02) and V2
///      (0x165C3410fC91EF562C50559f7d2289fEbed552d9) on PulseChain, and Uniswap V2
///      (0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D) on Ethereum, all expose these functions.
interface ISwapRouterLike {
    /// @notice Swaps exactly `amountIn` of `path[0]` for at least `amountOutMin` of the last token
    ///         in `path`, sent to `to`. Works with tokens that take a fee on transfer.
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;

    /// @notice How much of `path[0]` is needed to get `amountOut` of the last token in `path`.
    /// @dev Ignores transfer taxes.
    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts);

    /// @notice How much of the last token in `path` you get for `amountIn` of `path[0]`.
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
}
