// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Live addresses the deployment uses. All checked on-chain on 2026-11-05; USDT on
///         2026-11-11, and pDAI with its PulseX pools on 2026-11-11.
library PulseChainAddresses {
    /// @dev USDC bridged from Ethereum (6 decimals). The checkout's payment token.
    address internal constant USDC = 0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07;
    /// @dev DAI bridged from Ethereum ("Dai Stablecoin from Ethereum", 18 decimals). Also accepted
    ///      by the registrar. Not pDAI, the copy of DAI made at the fork (below). The app pays with
    ///      it through the checkout, which swaps it into USDC.
    address internal constant DAI = 0xefD766cCb38EaF1dfd701853BFCe31359239F305;
    /// @dev pDAI: the copy of DAI made when PulseChain forked from Ethereum, at the address DAI has
    ///      on Ethereum (18 decimals; on-chain its symbol is still "DAI"). It trades at its own price
    ///      on PulseX, a fraction of a dollar, so the registrar never takes it: the checkout swaps it
    ///      into USDC through WPLS, as it does HEX and PLSX. Its pools with WPLS are PulseX's
    ///      deepest for it (about 182 million pDAI on V2 and 18 million on V1); its pools with USDC
    ///      held under $250.
    address internal constant PDAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    /// @dev USDT bridged from Ethereum ("Tether USD from Ethereum", 6 decimals), as the official
    ///      bridge's bridgedTokenAddress gives it (checked 2026-11-11). Not the copy of USDT made at
    ///      the fork. Paid with through the checkout, which swaps it into USDC through WPLS.
    address internal constant USDT = 0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f;
    address internal constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    /// @dev HEX on PulseChain (8 decimals), the same address as on Ethereum.
    address internal constant HEX = 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39;
    /// @dev WETH bridged from Ethereum ("Wrapped Ether from Ethereum", 18 decimals), as the
    ///      official bridge's bridgedTokenAddress gives it. Not the copy of WETH made at the fork.
    address internal constant WETH_FROM_ETHEREUM = 0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C;
    /// @dev HEX bridged from Ethereum ("HEX from Ethereum", eHEX, 8 decimals). Not PulseChain's HEX.
    address internal constant HEX_FROM_ETHEREUM = 0x57fde0a71132198BBeC939B98976993d8D89D225;
    address internal constant PULSEX_V1_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address internal constant PULSEX_V2_ROUTER = 0x165C3410fC91EF562C50559f7d2289fEbed552d9;
}

/// @notice PulseChain Testnet v4 (chain id 943). All checked on-chain on 2026-11-07.
library PulseChainTestnetAddresses {
    /// @dev The testnet bridge's token contract. It makes the "... from Sepolia" copy of a token the
    ///      first time someone bridges it, so USDC and DAI are looked up here at deploy time.
    address internal constant TOKEN_BRIDGE = 0x6B08a50865aDeCe6e3869D9AfbB316d0a0436B6c;
    address internal constant WPLS = 0x70499adEBB11Efd915E3b69E700c331778628707;
    /// @dev HEX on the testnet (8 decimals), the same address as on mainnet.
    address internal constant HEX = 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39;
    address internal constant PULSEX_V1_ROUTER = 0xDaE9dd3d1A52CfCe9d5F2fAC7fDe164D500E50f7;
    address internal constant PULSEX_V2_ROUTER = 0x636f6407B90661b73b1C0F7e24F4C79f624d0738;
}

/// @notice Sepolia (chain id 11155111), Ethereum's testnet: only where the testnet's stablecoins
///         come from. Nothing is deployed there. Checked on-chain on 2026-11-07.
library SepoliaAddresses {
    /// @dev Circle's test USDC (faucet.circle.com). Its copy on PulseChain Testnet v4, "USDC from
    ///      Sepolia", is the testnet's USDC.
    address internal constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    /// @dev Aave's test DAI. Its copy on PulseChain Testnet v4 is the testnet's DAI.
    address internal constant DAI = 0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357;
}
