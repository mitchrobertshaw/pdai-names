// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {
    PulseChainAddresses as P,
    PulseChainTestnetAddresses as PT,
    SepoliaAddresses as S
} from "./Addresses.sol";
import {PdaiDeployer} from "./PdaiDeployer.sol";
import {ReservedName, ReservedNames} from "./ReservedNames.sol";

/// @notice The testnet bridge's token contract: where a token bridged from Sepolia lives on the testnet.
interface ITestnetTokenBridge {
    function bridgedTokenAddress(address sepoliaToken) external view returns (address);
}

/// @notice Deploys .pdai on PulseChain, in one step. Run it on PulseChain Testnet v4 to rehearse,
///         then on PulseChain for real; it picks the network by the chain it is run on.
/// @dev Environment:
///        ADMIN                 required. May raise or lower all prices together, change payment
///                              tokens and add registrars later; can never take, move or unregister
///                              a name, or change the price of one length.
///        BENEFICIARY           optional. Receives every payment for a name, directly, for good: the
///                              registrar can never change it. Defaults to ADMIN.
///        DEPLOYER_PRIVATE_KEY  optional. Without it, run without --broadcast for a dry run.
///      Names in script/reserved-names.csv are set aside before anyone can buy names.
///      On the testnet, USDC and DAI are the testnet bridge's copies of Sepolia's: bridge a little
///      of each from Sepolia first (deploy/pulsechain/README.md says how).
contract DeployPulseChain is Script, PdaiDeployer {
    /// @notice PulseChain mainnet, or PulseChain Testnet v4.
    struct Network {
        string name;
        address usdc;
        address dai;
        address wpls;
        address[] routers; // PulseX V1 and V2
    }

    function run() external returns (Deployment memory d) {
        Network memory net = _network();
        console.log("Network:", net.name);
        address admin = vm.envAddress("ADMIN");
        address beneficiary = vm.envOr("BENEFICIARY", admin);
        _requireCanHoldTokens(admin, "ADMIN");
        require(beneficiary != address(0), "BENEFICIARY is not set");
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
            _requireCanHoldTokens(reserved[i].owner, string.concat("The wallet for ", reserved[i].label, ".pdai"));
            ++given;
        }

        uint256 startBlock = block.number;
        address deployer = _startBroadcast();
        // The deployer's key sits in GitHub, so it must never hold powers or receive money.
        require(admin != deployer, "ADMIN can't be the deployer: its key sits in GitHub. Use another wallet");
        require(beneficiary != deployer, "BENEFICIARY can't be the deployer: its key sits in GitHub. Use another wallet");
        d = _deploy(
            Config({
                deployer: deployer,
                admin: admin,
                beneficiary: beneficiary,
                usdc: IERC20(net.usdc),
                dai: IERC20(net.dai),
                wpls: IERC20(net.wpls),
                routers: net.routers,
                reserved: reserved
            })
        );
        vm.stopBroadcast();

        console.log("");
        console.log(string.concat("=== .pdai on ", net.name, " ==="));
        console.log("PDAI_REGISTRY            ", address(d.pdaiRegistry));
        console.log("REGISTRAR                ", address(d.registrar));
        console.log("CHECKOUT                 ", address(d.checkout));
        console.log("USDC                     ", net.usdc);
        console.log("START_BLOCK              ", startBlock);
        console.log("Payments go to           ", d.registrar.BENEFICIARY());
        console.log("UniversalResolver        ", address(d.universalResolver));
        console.log("Root registry            ", address(d.rootRegistry));
        console.log("Default resolver         ", address(d.ownerResolver));
        console.log("Price oracle             ", address(d.oracle));
        console.log("Name rules (63, 5 years) ", address(d.rules));
        console.log("Price rules locked       ", d.registrar.owner() == address(0) ? "yes, for good" : "NO");
        console.log("Resolver factory         ", address(d.verifiableFactory));
        console.log("Resolver implementation  ", address(d.resolverImplementation));
        console.log("Label store              ", address(d.labelStore));
        console.log("Name cards               ", address(d.nameCard));
        console.log("Reserved names given     ", given);
        console.log("Reserved names held      ", reserved.length - given);
        bool deployerKeptNothing =
            d.pdaiRegistry.roles(0, deployer) == 0 && d.rootRegistry.roles(0, deployer) == 0;
        console.log("Deployer roles left      ", deployerKeptNothing ? "none" : "SOME: don't use this deployment");
    }

    /// @dev The network this script is running on.
    function _network() internal view returns (Network memory n) {
        n.routers = new address[](2);
        if (block.chainid == PULSECHAIN_CHAIN_ID) {
            n.name = "PulseChain";
            n.usdc = P.USDC;
            n.dai = P.DAI;
            n.wpls = P.WPLS;
            (n.routers[0], n.routers[1]) = (P.PULSEX_V1_ROUTER, P.PULSEX_V2_ROUTER);
        } else if (block.chainid == PULSECHAIN_TESTNET_CHAIN_ID) {
            n.name = "PulseChain Testnet v4";
            n.usdc = _fromSepolia(S.USDC, "USDC");
            n.dai = _fromSepolia(S.DAI, "DAI");
            n.wpls = PT.WPLS;
            (n.routers[0], n.routers[1]) = (PT.PULSEX_V1_ROUTER, PT.PULSEX_V2_ROUTER);
        } else {
            revert("not PulseChain (chain id 369) or PulseChain Testnet v4 (943)");
        }
    }

    /// @dev The testnet copy of a Sepolia token. It exists once someone has bridged the token over.
    function _fromSepolia(address sepoliaToken, string memory symbol) internal view returns (address token) {
        token = ITestnetTokenBridge(PT.TOKEN_BRIDGE).bridgedTokenAddress(sepoliaToken);
        require(
            token != address(0),
            string.concat(
                symbol,
                " isn't on PulseChain Testnet v4 yet. Bridge a little ",
                symbol,
                " over from Sepolia first, at bridge.v4.testnet.pulsechain.com"
            )
        );
    }

    /// @dev Starts broadcasting from DEPLOYER_PRIVATE_KEY, or simulates if it is not set.
    function _startBroadcast() internal returns (address deployer) {
        uint256 key = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (key != 0) {
            deployer = vm.addr(key);
            vm.startBroadcast(key);
        } else {
            deployer = msg.sender;
            vm.startBroadcast();
        }
        console.log("Deployer:", deployer);
    }

    /// @dev The admin receives the `pdai` token, so it must be able to hold it: a plain wallet, or
    ///      a contract wallet such as a Safe that accepts ERC-1155 tokens.
    function _requireCanHoldTokens(address account, string memory what) internal view {
        require(account != address(0), string.concat(what, " is not set"));
        if (account.code.length == 0) return;
        bool ok;
        try IERC165(account).supportsInterface(type(IERC1155Receiver).interfaceId) returns (bool yes) {
            ok = yes;
        } catch {}
        require(ok, string.concat(what, " is a contract that cannot hold ERC-1155 tokens; use a wallet or a Safe"));
    }

    function _requireCode(address account, string memory what) internal view {
        require(account.code.length != 0, string.concat(what, " has no contract code on this chain"));
    }
}
