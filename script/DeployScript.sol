// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {
    EthereumAddresses as E,
    PulseChainAddresses as P,
    PulseChainTestnetAddresses as PT,
    SepoliaAddresses as S
} from "./Addresses.sol";
import {HexDeployer} from "./HexDeployer.sol";

/// @notice The testnet bridge's token contract: where a token bridged from Sepolia lives on the testnet.
interface ITestnetTokenBridge {
    function bridgedTokenAddress(address sepoliaToken) external view returns (address);
}

/// @notice What the three deploy scripts share: which network, who is deploying, and the checks run
///         first. Each script works on mainnet or on the testnets, picked by the chain it is run on.
abstract contract DeployScript is Script, HexDeployer {
    /// @notice The PulseChain side of a network: PulseChain mainnet, or PulseChain Testnet v4.
    struct PulseChainNetwork {
        string name;
        address amb;
        address usdc;
        address dai;
        address wpls;
        address[] routers; // PulseX V1 and V2
        uint256 ethereumChainId; // its partner: Ethereum, or Sepolia
        address ethereumAmb;
        string ethereumRpcUrl; // used unless ETHEREUM_RPC_URL is set
    }

    /// @notice The Ethereum side of a network: Ethereum mainnet, or Sepolia.
    struct EthereumNetwork {
        string name;
        address amb;
        address usdc;
        address weth;
        address[] routers; // Uniswap V2
        uint256 pulsechainChainId; // its partner: PulseChain, or PulseChain Testnet v4
        address pulsechainAmb;
        string pulsechainRpcUrl; // used unless PULSECHAIN_RPC_URL is set
    }

    /// @dev Gas each bridge message asks for on Ethereum. Each uses well under half of this (see
    ///      the tests); only the gas actually used is paid for.
    uint256 internal constant MIRROR_GAS = 1_000_000;
    uint256 internal constant SETTLE_GAS = 300_000;
    /// @dev How long a filler has to register an Ethereum order's name, and how long after that a
    ///      buyer must wait to take an unsettled order's money back.
    uint64 internal constant FILL_WINDOW = 30 minutes;
    uint64 internal constant RECLAIM_DELAY = 6 hours;

    /// @dev The PulseChain side this script is running on.
    function _pulsechain() internal view returns (PulseChainNetwork memory n) {
        n.routers = new address[](2);
        if (block.chainid == PULSECHAIN_CHAIN_ID) {
            n.name = "PulseChain";
            n.amb = P.AMB;
            n.usdc = P.USDC;
            n.dai = P.DAI;
            n.wpls = P.WPLS;
            (n.routers[0], n.routers[1]) = (P.PULSEX_V1_ROUTER, P.PULSEX_V2_ROUTER);
            n.ethereumChainId = ETHEREUM_CHAIN_ID;
            n.ethereumAmb = E.AMB;
            n.ethereumRpcUrl = "https://ethereum-rpc.publicnode.com";
        } else if (block.chainid == PULSECHAIN_TESTNET_CHAIN_ID) {
            n.name = "PulseChain Testnet v4";
            n.amb = PT.AMB;
            n.usdc = _fromSepolia(S.USDC, "USDC");
            n.dai = _fromSepolia(S.DAI, "DAI");
            n.wpls = PT.WPLS;
            (n.routers[0], n.routers[1]) = (PT.PULSEX_V1_ROUTER, PT.PULSEX_V2_ROUTER);
            n.ethereumChainId = SEPOLIA_CHAIN_ID;
            n.ethereumAmb = S.AMB;
            n.ethereumRpcUrl = "https://ethereum-sepolia-rpc.publicnode.com";
        } else {
            revert("not PulseChain (chain id 369) or PulseChain Testnet v4 (943)");
        }
    }

    /// @dev The Ethereum side this script is running on.
    function _ethereum() internal view returns (EthereumNetwork memory n) {
        n.routers = new address[](1);
        if (block.chainid == ETHEREUM_CHAIN_ID) {
            n.name = "Ethereum";
            n.amb = E.AMB;
            n.usdc = E.USDC;
            n.weth = E.WETH;
            n.routers[0] = E.UNISWAP_V2_ROUTER;
            n.pulsechainChainId = PULSECHAIN_CHAIN_ID;
            n.pulsechainAmb = P.AMB;
            n.pulsechainRpcUrl = "https://rpc.pulsechain.com";
        } else if (block.chainid == SEPOLIA_CHAIN_ID) {
            n.name = "Sepolia";
            n.amb = S.AMB;
            n.usdc = S.USDC;
            n.weth = S.WETH;
            n.routers[0] = S.UNISWAP_V2_ROUTER;
            n.pulsechainChainId = PULSECHAIN_TESTNET_CHAIN_ID;
            n.pulsechainAmb = PT.AMB;
            n.pulsechainRpcUrl = "https://rpc.v4.testnet.pulsechain.com";
        } else {
            revert("not Ethereum (chain id 1) or Sepolia (11155111)");
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

    /// @dev The admin receives the `hex` token, so it must be able to hold it: a plain wallet, or
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

    /// @dev Switches to the other chain to read contracts there, after checking the RPC really is
    ///      that chain. Switch back with `vm.selectFork(here)`. For checking addresses before linking
    ///      to them.
    function _onOtherChain(string memory rpcEnv, string memory defaultRpc, uint256 expectedChainId)
        internal
        returns (uint256 here)
    {
        here = vm.activeFork();
        vm.createSelectFork(vm.envOr(rpcEnv, defaultRpc));
        require(block.chainid == expectedChainId, string.concat(rpcEnv, " is not the partner chain of this one"));
    }
}
