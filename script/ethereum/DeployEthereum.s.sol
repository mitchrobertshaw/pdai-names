// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DeployScript} from "../DeployScript.sol";
import {IAMB} from "../../src/interfaces/IAMB.sol";
import {HexMirrorSync} from "../../src/pulsechain/HexMirrorSync.sol";
import {HexOrderFiller} from "../../src/pulsechain/HexOrderFiller.sol";

/// @notice Step 2 of 3: deploys the Ethereum side of .hex and links it to PulseChain. Run it on
///         Sepolia to rehearse with PulseChain Testnet v4, then on Ethereum for real.
/// @dev Environment:
///        ADMIN                    required. On Ethereum it only owns the gateway list and the
///                                 contract namer; it has no say over names.
///        PULSECHAIN_MIRROR_SYNC   required. From step 1.
///        PULSECHAIN_ORDER_FILLER  required. From step 1.
///        PULSECHAIN_RPC_URL       optional. Used to check those two addresses first.
///        DEPLOYER_PRIVATE_KEY     optional. The same key as step 1.
contract DeployEthereum is DeployScript {
    function run() external returns (Mirror memory mirror) {
        EthereumNetwork memory net = _ethereum();
        console.log("Network:", net.name);
        address admin = vm.envAddress("ADMIN");
        address plsMirrorSync = vm.envAddress("PULSECHAIN_MIRROR_SYNC");
        address plsOrderFiller = vm.envAddress("PULSECHAIN_ORDER_FILLER");
        _requireCanHoldTokens(admin, "ADMIN");
        _requireCode(net.amb, "The bridge");
        _requireCode(net.usdc, "USDC");
        _requireCode(net.weth, "WETH");
        _requireCode(net.routers[0], "Uniswap V2");

        uint256 key = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        address deployer = key != 0 ? vm.addr(key) : msg.sender;
        _checkPulseChain(net, plsMirrorSync, plsOrderFiller, deployer);

        uint256 startBlock = block.number;
        _startBroadcast();
        mirror = _deployMirror(
            MirrorConfig({
                deployer: deployer,
                admin: admin,
                amb: IAMB(net.amb),
                pulsechainChainId: net.pulsechainChainId,
                usdc: IERC20(net.usdc),
                weth: IERC20(net.weth),
                routers: net.routers,
                fillWindow: FILL_WINDOW,
                reclaimDelay: RECLAIM_DELAY
            })
        );
        mirror.mirrorRegistrar.link(plsMirrorSync);
        mirror.orderBook.link(plsOrderFiller);
        vm.stopBroadcast();

        console.log("");
        console.log(string.concat("=== .hex on ", net.name, " ==="));
        console.log("ETHEREUM_MIRROR_REGISTRAR", address(mirror.mirrorRegistrar));
        console.log("ETHEREUM_ORDER_BOOK      ", address(mirror.orderBook));
        console.log("START_BLOCK_ETHEREUM     ", startBlock);
        console.log("UniversalResolver        ", address(mirror.core.universalResolver));
        console.log(".hex registry (copy)     ", address(mirror.core.hexRegistry));
        console.log("Root registry            ", address(mirror.core.rootRegistry));
        console.log("Default resolver         ", address(mirror.core.ownerResolver));
        console.log("Resolver factory         ", address(mirror.core.verifiableFactory));
        console.log("Resolver implementation  ", address(mirror.core.resolverImplementation));
        console.log("Name cards               ", address(mirror.core.nameCard));
        console.log("Next: step 3 (link PulseChain) with all four PULSECHAIN_ and ETHEREUM_ addresses.");
    }

    /// @dev Makes sure the step 1 addresses are the real, unlinked PulseChain contracts, deployed
    ///      by the same key for this network, before linking to them for good.
    function _checkPulseChain(
        EthereumNetwork memory net,
        address plsMirrorSync,
        address plsOrderFiller,
        address deployer
    ) internal {
        uint256 ethereumChainId = block.chainid;
        uint256 here = _onOtherChain("PULSECHAIN_RPC_URL", net.pulsechainRpcUrl, net.pulsechainChainId);
        _requireCode(plsMirrorSync, "PULSECHAIN_MIRROR_SYNC");
        _requireCode(plsOrderFiller, "PULSECHAIN_ORDER_FILLER");
        HexMirrorSync sync = HexMirrorSync(plsMirrorSync);
        HexOrderFiller filler = HexOrderFiller(plsOrderFiller);
        require(address(sync.AMB()) == net.pulsechainAmb, "PULSECHAIN_MIRROR_SYNC is not a .hex HexMirrorSync");
        require(address(filler.AMB()) == net.pulsechainAmb, "PULSECHAIN_ORDER_FILLER is not a .hex HexOrderFiller");
        require(
            sync.PEER_CHAIN_ID() == ethereumChainId && filler.PEER_CHAIN_ID() == ethereumChainId,
            "step 1 was deployed for a different Ethereum network"
        );
        require(sync.LINKER() == deployer && filler.LINKER() == deployer, "step 1 used a different deployer key");
        require(sync.peer() == address(0) && filler.peer() == address(0), "already linked to something else");
        require(address(filler.MIRROR_SYNC()) == plsMirrorSync, "the two addresses are from different deployments");
        vm.selectFork(here);
    }
}
