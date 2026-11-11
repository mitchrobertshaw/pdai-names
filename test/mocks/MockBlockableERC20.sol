// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {MockERC20} from "./MockERC20.sol";

/// @notice ERC-20 that can refuse transfers to or from chosen addresses, as USDC can.
contract MockBlockableERC20 is MockERC20 {
    mapping(address account => bool) public blocked;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockERC20(name_, symbol_, decimals_) {}

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from] && !blocked[to], "MockBlockableERC20: blocked");
        super._update(from, to, value);
    }
}
