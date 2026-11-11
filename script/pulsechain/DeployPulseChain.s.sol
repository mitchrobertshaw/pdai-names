// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DeployScript} from "../DeployScript.sol";
import {ReservedName, ReservedNames} from "../ReservedNames.sol";
import {IAMB} from "../../src/interfaces/IAMB.sol";

/// @notice Step 1 of 3: deploys .hex on PulseChain, where names live and are sold. Run it on
///         PulseChain Testnet v4 to rehearse with Sepolia, then on PulseChain for real.
/// @dev Environment:
///        ADMIN                 required. May raise or lower all prices together, change payment
///                              tokens and add registrars later; can never take, move or unregister
///                              a name, or change the price of one length.
///        BENEFICIARY           optional. Receives every payment for a name, directly, for good: the
///                              registrar can never change it. Defaults to ADMIN.
///        DEPLOYER_PRIVATE_KEY  optional. Without it, run without --broadcast for a dry run.
///      Names in script/reserved-names.csv are set aside before anyone can buy names.
///      Use the same deployer key for steps 2 and 3: it is the only key that can link the two
///      chains together, once.
///      On the testnet, USDC and DAI are the testnet bridge's copies of Sepolia's: bridge a little
///      of each from Sepolia first (deploy/pulsechain/README.md says how).
contract DeployPulseChain is DeployScript {
    function run() external returns (Hub memory hub) {
        PulseChainNetwork memory net = _pulsechain();
        console.log("Network:", net.name);
        address admin = vm.envAddress("ADMIN");
        address beneficiary = vm.envOr("BENEFICIARY", admin);
        _requireCanHoldTokens(admin, "ADMIN");
        require(beneficiary != address(0), "BENEFICIARY is not set");
        _requireCode(net.amb, "The bridge");
        _requireCode(net.usdc, "USDC");
        _requireCode(net.dai, "DAI");
        _requireCode(net.wpls, "WPLS");
        _requireCode(net.routers[0], "PulseX V1");
        _requireCode(net.routers[1], "PulseX V2");

        ReservedName[] memory reserved =
            ReservedNames.read(string.concat(vm.projectRoot(), "/script/reserved-names.csv"));
        uint256 given;
        for (uint256 i = 0; i < reserved.length; ++i) {
            if (reserved[i].owner == address(0)) continue;
            _requireCanHoldTokens(reserved[i].owner, string.concat("The wallet for ", reserved[i].label, ".hex"));
            ++given;
        }

        uint256 startBlock = block.number;
        address deployer = _startBroadcast();
        // The deployer's key sits in GitHub, so it must never hold powers or receive money.
        require(admin != deployer, "ADMIN can't be the deployer: its key sits in GitHub. Use another wallet");
        require(beneficiary != deployer, "BENEFICIARY can't be the deployer: its key sits in GitHub. Use another wallet");
        hub = _deployHub(
            HubConfig({
                deployer: deployer,
                admin: admin,
                beneficiary: beneficiary,
                amb: IAMB(net.amb),
                ethereumChainId: net.ethereumChainId,
                usdc: IERC20(net.usdc),
                dai: IERC20(net.dai),
                wpls: IERC20(net.wpls),
                routers: net.routers,
                mirrorGas: MIRROR_GAS,
                settleGas: SETTLE_GAS,
                reserved: reserved
            })
        );
        vm.stopBroadcast();

        console.log("");
        console.log(string.concat("=== .hex on ", net.name, " ==="));
        console.log("PULSECHAIN_MIRROR_SYNC   ", address(hub.mirrorSync));
        console.log("PULSECHAIN_ORDER_FILLER  ", address(hub.orderFiller));
        console.log("PULSECHAIN_REGISTRAR     ", address(hub.registrar));
        console.log("PULSECHAIN_HEX_REGISTRY  ", address(hub.core.hexRegistry));
        console.log("PULSECHAIN_USDC          ", net.usdc);
        console.log("START_BLOCK_PULSECHAIN   ", startBlock);
        console.log("Payments go to           ", hub.registrar.BENEFICIARY());
        console.log("PULSECHAIN_CHECKOUT      ", address(hub.checkout));
        console.log("UniversalResolver        ", address(hub.core.universalResolver));
        console.log("Root registry            ", address(hub.core.rootRegistry));
        console.log("Default resolver         ", address(hub.core.ownerResolver));
        console.log("Price oracle             ", address(hub.oracle));
        console.log("Name rules (63, 5 years) ", address(hub.rules));
        console.log("Price rules locked       ", hub.registrar.owner() == address(0) ? "yes, for good" : "NO");
        console.log("Resolver factory         ", address(hub.core.verifiableFactory));
        console.log("Resolver implementation  ", address(hub.core.resolverImplementation));
        console.log("Label store              ", address(hub.core.labelStore));
        console.log("Name cards               ", address(hub.core.nameCard));
        console.log("Reserved names given     ", given);
        console.log("Reserved names held      ", reserved.length - given);
        console.log("Next: step 2 (Ethereum side) with PULSECHAIN_MIRROR_SYNC and PULSECHAIN_ORDER_FILLER.");
    }
}
