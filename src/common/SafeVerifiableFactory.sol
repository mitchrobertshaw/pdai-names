// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {UUPSProxyLogic} from "@ensdomains/verifiable-factory/UUPSProxyLogic.sol";
import {VerifiableFactory} from "@ensdomains/verifiable-factory/VerifiableFactory.sol";

/// @title InertImplementation
/// @notice Has no functions, so every call to it reverts. It is the shared proxy logic's own
///         implementation (see SafeVerifiableFactory), and can never run anything.
contract InertImplementation {}

/// @title SafeVerifiableFactory
/// @notice Deploys ENSv2's VerifiableFactory, which makes owners' own resolvers, and in the same
///         transaction initializes the proxy logic contract it shares with every resolver it makes.
/// @dev Every resolver the factory makes forwards each call to that one logic contract. Left
///      uninitialized, anyone could call `initialize` on the logic contract itself with code that
///      self-destructs it; on a chain without EIP-6780, as PulseChain is, the contract would be
///      gone and every resolver forwarding to it would answer nothing, for good. Initialized here
///      with an implementation that does nothing, it refuses `initialize` (AlreadyInitialized), its
///      upgrade and fallback paths delegate only into InertImplementation (which reverts), and the
///      resolvers, each with its own storage, are unaffected.
contract SafeVerifiableFactory {
    VerifiableFactory public immutable FACTORY;

    constructor() {
        FACTORY = new VerifiableFactory();
        UUPSProxyLogic(payable(FACTORY.proxyLogic())).initialize(address(new InertImplementation()), "");
    }
}
