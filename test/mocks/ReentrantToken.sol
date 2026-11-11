// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SwapPayments} from "../../src/common/SwapPayments.sol";
import {AnyTokenCheckout} from "../../src/pulsechain/AnyTokenCheckout.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Token that tries to call back into the checkout while it is being paid.
contract ReentrantToken is MockERC20 {
    AnyTokenCheckout public target;
    bool public armed;

    constructor() MockERC20("Reentrant", "RE", 18) {}

    function arm(AnyTokenCheckout target_) external {
        target = target_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && to == address(target)) {
            armed = false;
            AnyTokenCheckout.Renewal memory ren = AnyTokenCheckout.Renewal("reentry", 1, bytes32(0));
            SwapPayments.Swap memory none;
            target.renewWithToken(ren, IERC20(address(this)), 0, none);
        }
    }
}
