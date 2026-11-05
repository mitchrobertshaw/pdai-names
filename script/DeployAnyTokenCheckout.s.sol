// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AnyTokenCheckout} from "../src/AnyTokenCheckout.sol";
import {IRegistrarLike} from "../src/interfaces/IRegistrarLike.sol";

/// @notice Deploys AnyTokenCheckout on PulseChain mainnet.
/// @dev Environment variables:
///        REGISTRAR             required. The .pdai registrar the checkout pays.
///        PAYMENT_TOKEN         optional. Defaults to DAI bridged from Ethereum.
///        DEPLOYER_PRIVATE_KEY  optional. Without it, run without --broadcast for a dry run.
contract DeployAnyTokenCheckout is Script {
    // Checked on-chain on 2026-11-05.
    address internal constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address internal constant DAI_FROM_ETHEREUM = 0xefD766cCb38EaF1dfd701853BFCe31359239F305;
    address internal constant PULSEX_V1_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address internal constant PULSEX_V2_ROUTER = 0x165C3410fC91EF562C50559f7d2289fEbed552d9;

    function run() external returns (AnyTokenCheckout checkout) {
        address registrar = vm.envAddress("REGISTRAR");
        address paymentToken = vm.envOr("PAYMENT_TOKEN", DAI_FROM_ETHEREUM);

        require(block.chainid == 369, "not PulseChain mainnet (chain id 369)");
        require(registrar.code.length != 0, "REGISTRAR has no contract code on this chain");
        require(paymentToken.code.length != 0, "PAYMENT_TOKEN has no contract code on this chain");

        address[] memory routers = new address[](2);
        routers[0] = PULSEX_V1_ROUTER;
        routers[1] = PULSEX_V2_ROUTER;

        uint256 key = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (key != 0) {
            vm.startBroadcast(key);
        } else {
            vm.startBroadcast();
        }
        checkout = new AnyTokenCheckout(IRegistrarLike(registrar), IERC20(paymentToken), IERC20(WPLS), routers);
        vm.stopBroadcast();

        console.log("AnyTokenCheckout:", address(checkout));
        console.log("Registrar:", registrar);
        console.log("Payment token:", paymentToken);
    }
}
