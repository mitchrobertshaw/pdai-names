// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {MockERC20} from "./MockERC20.sol";

/// @notice ERC-20 that burns a percentage of every transfer, like many PulseChain tokens' taxes.
contract MockTaxedERC20 is MockERC20 {
    uint256 public immutable TAX_BPS;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 taxBps)
        MockERC20(name_, symbol_, decimals_)
    {
        TAX_BPS = taxBps;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || TAX_BPS == 0) {
            super._update(from, to, value);
            return;
        }
        uint256 tax = value * TAX_BPS / 10_000;
        super._update(from, address(0), tax);
        super._update(from, to, value - tax);
    }
}
