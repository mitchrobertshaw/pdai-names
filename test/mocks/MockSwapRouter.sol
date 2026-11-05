// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {MockERC20} from "./MockERC20.sol";

/// @notice Fixed-rate stand-in for a Uniswap-V2-style router. Only the first and last tokens of
///         a path matter. The output token is minted, so it must be a MockERC20.
contract MockSwapRouter {
    using SafeERC20 for IERC20;

    /// @notice Output per unit of input, scaled by 1e18, for each (input, output) pair.
    mapping(address tokenIn => mapping(address tokenOut => uint256 rate)) public rate;

    function setRate(address tokenIn, address tokenOut, uint256 rate_) external {
        rate[tokenIn][tokenOut] = rate_;
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        require(block.timestamp <= deadline, "MockSwapRouter: EXPIRED");
        require(path.length >= 2, "MockSwapRouter: INVALID_PATH");
        uint256 r = rate[path[0]][path[path.length - 1]];
        require(r != 0, "MockSwapRouter: NO_POOL");

        IERC20 tokenIn = IERC20(path[0]);
        uint256 before = tokenIn.balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = tokenIn.balanceOf(address(this)) - before; // what arrived after any tax

        uint256 out = received * r / 1e18;
        require(out >= amountOutMin, "MockSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        MockERC20(path[path.length - 1]).mint(to, out);
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts) {
        uint256 r = rate[path[0]][path[path.length - 1]];
        require(r != 0, "MockSwapRouter: NO_POOL");
        amounts = new uint256[](path.length);
        amounts[0] = Math.ceilDiv(amountOut * 1e18, r);
        amounts[path.length - 1] = amountOut;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn * rate[path[0]][path[path.length - 1]] / 1e18;
    }
}
