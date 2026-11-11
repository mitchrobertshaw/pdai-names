// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {GatewayProvider} from "@ens/contracts/ccipRead/GatewayProvider.sol";
import {IGatewayProvider} from "@ens/contracts/ccipRead/IGatewayProvider.sol";
import {VerifiableFactory} from "@ensdomains/verifiable-factory/VerifiableFactory.sol";

import {ETHRegistrar, REGISTRATION_ROLE_BITMAP} from "@ensv2/registrar/ETHRegistrar.sol";
import {IRentPriceOracle} from "@ensv2/registrar/interfaces/IRentPriceOracle.sol";
import {StandardRentPriceOracle, DiscountPoint, PaymentRatio} from "@ensv2/registrar/StandardRentPriceOracle.sol";
import {PermissionedRegistry} from "@ensv2/registry/PermissionedRegistry.sol";
import {IPermissionedRegistry} from "@ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensv2/registry/libraries/RegistryRolesLib.sol";
import {PermissionedResolver} from "@ensv2/resolver/PermissionedResolver.sol";
import {IContractNamer} from "@ensv2/reverse-registrar/interfaces/IContractNamer.sol";
import {UniversalResolverV2} from "@ensv2/universalResolver/UniversalResolverV2.sol";
import {ContractNamer} from "@ensv2/utils/ContractNamer.sol";
import {LabelStore} from "@ensv2/utils/LabelStore.sol";
import {ILabelStore} from "@ensv2/utils/interfaces/ILabelStore.sol";

import {OwnerResolver} from "../src/common/OwnerResolver.sol";
import {SafeVerifiableFactory} from "../src/common/SafeVerifiableFactory.sol";
import {HexNameCard} from "../src/common/HexNameCard.sol";
import {HexMirrorRegistrar} from "../src/ethereum/HexMirrorRegistrar.sol";
import {HexOrderBook} from "../src/ethereum/HexOrderBook.sol";
import {IAMB} from "../src/interfaces/IAMB.sol";
import {IHexMirrorSync} from "../src/interfaces/IHexBridge.sol";
import {AnyTokenCheckout} from "../src/pulsechain/AnyTokenCheckout.sol";
import {HexMirrorSync} from "../src/pulsechain/HexMirrorSync.sol";
import {HexNameRules} from "../src/pulsechain/HexNameRules.sol";
import {HexOrderFiller} from "../src/pulsechain/HexOrderFiller.sol";
import {ReservedName, ReservedNames} from "./ReservedNames.sol";

/// @title HexDeployer
/// @notice Deploys .hex: ENSv2 with a `hex` ending, the real registry on PulseChain and a copy on
///         Ethereum, joined by the official PulseChain bridge. Used by the deploy scripts and by
///         the tests, so the tests run against exactly what gets deployed.
/// @dev Settings follow ENSv2's own deployment (contracts-v2 script/deploy-constants.ts) except
///      the price of 5+ letter names: $10 a year, covering the name on both chains, instead of
///      ENS's $8; and the oracle's finer units, which make every price exact (see PRICE_DECIMALS).
abstract contract HexDeployer {
    // --- Registrar settings (ENSv2 defaults) ---
    uint64 internal constant GRACE_PERIOD = 28 days;
    uint64 internal constant MIN_COMMITMENT_AGE = 60 seconds;
    uint64 internal constant MAX_COMMITMENT_AGE = 1 days;
    uint64 internal constant MIN_REGISTER_DURATION = 28 days;

    // --- Prices ---
    /// @dev The oracle works in "standard units": here a dollar is 10^27 of them, where ENS uses
    ///      10^12. It keeps each price per second, and a year's price doesn't divide evenly into
    ///      seconds, so each rate is rounded; then the amount to pay is rounded up to the token's
    ///      smallest unit. With ENS's units that made a year 10.000003 USDC. With these, the
    ///      rounding stays below the smallest unit of USDC or DAI, so every whole number of years
    ///      costs exactly its price: 10 USDC (or 10 DAI) for a year of a 5+ letter name.
    uint8 internal constant PRICE_DECIMALS = 27;
    uint256 internal constant PRICE_SCALE = 10 ** PRICE_DECIMALS;
    uint256 internal constant SEC_PER_YEAR = 365 days;
    /// @dev Dollars a year by length. Names of 1 or 2 characters are not for sale.
    uint256 internal constant YEARLY_PRICE_3 = 320;
    uint256 internal constant YEARLY_PRICE_4 = 160;
    uint256 internal constant YEARLY_PRICE_5_PLUS = 10; // one price for PulseChain and Ethereum
    /// @dev A name that just expired starts at $100 million and halves daily for 21 days, so
    ///      nobody can snipe it the moment it lapses.
    uint256 internal constant PREMIUM_PRICE_INITIAL = PRICE_SCALE * 100_000_000;
    uint64 internal constant PREMIUM_HALVING_PERIOD = 1 days;
    uint64 internal constant PREMIUM_PERIOD = 21 days;
    /// @dev Multi-year prices, as a share of the full price: 2 years cost 1.5 years' price, 3 cost
    ///      1.75, 4 cost 1.875 and 5 cost 2, so 5 years cost the same as 2. HexNameRules stops at 5.
    uint128 internal constant DISCOUNT_DENOMINATOR = 1e38;

    /// @dev How long reserved names last from deployment. A held name can't be bought for that
    ///      long unless the admin hands it over; a given name is paid up for that long. The admin
    ///      can extend either.
    uint64 internal constant RESERVATION_PERIOD = 5 * 365 days;

    /// @dev The most anyone can be charged to have a name copied to Ethereum at once, in dollars: a
    ///      safety limit against a faulty bot, which Ethereum would reach at about 1,500 gwei. Below
    ///      it, buyers may pay whatever copying at once costs. The admin can change it, or switch the
    ///      copy fee off, and chooses the bot that sets it.
    uint256 internal constant MAX_COPY_FEE_DOLLARS = 1000;

    uint64 internal constant MAX_EXPIRY = type(uint64).max;
    uint256 internal constant ETHEREUM_CHAIN_ID = 1;
    uint256 internal constant PULSECHAIN_CHAIN_ID = 369;
    /// @dev The testnets, joined by PulseChain's official testnet bridge.
    uint256 internal constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 internal constant PULSECHAIN_TESTNET_CHAIN_ID = 943;
    string internal constant TLD = "hex";

    /// @notice The ENSv2 contracts both chains have.
    struct Core {
        IContractNamer contractNamer; // UUPS proxy, owned by the admin
        LabelStore labelStore;
        PermissionedRegistry rootRegistry;
        PermissionedRegistry hexRegistry;
        OwnerResolver ownerResolver; // resolver of `hex`: names resolve to their owner by default
        GatewayProvider batchGatewayProvider;
        UniversalResolverV2 universalResolver; // what wallets and apps look names up through
        VerifiableFactory verifiableFactory; // deploys owners' own resolvers
        PermissionedResolver resolverImplementation;
        HexNameCard nameCard; // what wallets and marketplaces show for each name
    }

    /// @notice PulseChain: where names live and are sold.
    struct Hub {
        Core core;
        StandardRentPriceOracle oracle; // prices; the admin manages it
        HexNameRules rules; // between the registrar and the oracle: plain names of 63 characters at most, 5 years ahead at most
        ETHRegistrar registrar;
        HexMirrorSync mirrorSync;
        HexOrderFiller orderFiller;
        AnyTokenCheckout checkout;
    }

    struct HubConfig {
        address deployer; // the account sending the deployment; gives up its roles at the end
        address admin; // may raise or lower all prices, change payment tokens, add registrars and run the copy fee; can't take names
        address beneficiary; // receives every registration and renewal payment
        IAMB amb; // the bridge's message contract on PulseChain
        uint256 ethereumChainId; // where the Ethereum copy lives: Ethereum (1), or Sepolia on the testnet
        IERC20 usdc; // USDC bridged from Ethereum: accepted by the registrar, used by the checkout
        IERC20 dai; // DAI bridged from Ethereum: also accepted by the registrar
        IERC20 wpls;
        address[] routers; // PulseX routers for the checkout
        uint256 mirrorGas; // gas each Ethereum copy message asks for
        uint256 settleGas; // gas each Ethereum settlement message asks for
        ReservedName[] reserved; // set aside before anyone can buy names (see `_reserve`)
    }

    /// @notice Ethereum: a copy of every name, and orders for buying from Ethereum.
    struct Mirror {
        Core core;
        HexMirrorRegistrar mirrorRegistrar;
        HexOrderBook orderBook;
    }

    struct MirrorConfig {
        address deployer;
        address admin; // owns only the gateway list and the contract namer; has no say over names
        IAMB amb; // the bridge's message contract on Ethereum
        uint256 pulsechainChainId; // where names live: PulseChain (369), or its testnet (943)
        IERC20 usdc;
        IERC20 weth;
        address[] routers; // Uniswap-V2-style routers for paying with other tokens
        uint64 fillWindow;
        uint64 reclaimDelay;
    }

    // ------------------------------------------------------------------------------------------
    // PulseChain
    // ------------------------------------------------------------------------------------------

    /// @dev Deploys the PulseChain side. The two bridge contracts still need `link`ing to their
    ///      Ethereum partners afterwards, by `cfg.deployer`.
    function _deployHub(HubConfig memory cfg) internal returns (Hub memory hub) {
        // The .hex registry: the deployer may grant the registrar, renewer and reserved-name roles
        // and set the parent, nothing more. In particular nobody gets the roles to unregister,
        // transfer, or change the resolver of someone else's name.
        uint256 hexRegistryRoles = RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_RENEW_ADMIN
            | RegistryRolesLib.ROLE_REGISTER_RESERVED_ADMIN | RegistryRolesLib.ROLE_SET_PARENT
            | RegistryRolesLib.ROLE_SET_PARENT_ADMIN | RegistryRolesLib.ROLE_SET_URI
            | RegistryRolesLib.ROLE_SET_URI_ADMIN;
        hub.core = _deployCore(cfg.deployer, cfg.admin, hexRegistryRoles, false);
        PermissionedRegistry hexRegistry = hub.core.hexRegistry;

        // Before the registrar exists, so nobody can buy a reserved name first.
        _reserve(hexRegistry, cfg.deployer, cfg.reserved);

        hub.oracle = new StandardRentPriceOracle(
            cfg.admin,
            _baseRates(),
            _discountPoints(),
            DISCOUNT_DENOMINATOR,
            PREMIUM_PRICE_INITIAL,
            PREMIUM_HALVING_PERIOD,
            PREMIUM_PERIOD,
            _paymentRatios(cfg.usdc, cfg.dai)
        );
        hub.rules = new HexNameRules(IRentPriceOracle(address(hub.oracle)));
        hub.registrar = new ETHRegistrar(
            cfg.deployer,
            hexRegistry,
            cfg.beneficiary,
            IRentPriceOracle(address(hub.rules)),
            GRACE_PERIOD,
            MIN_COMMITMENT_AGE,
            MAX_COMMITMENT_AGE,
            MIN_REGISTER_DURATION
        );
        // The registrar's one owner power is swapping its price list (`setRentPriceOracle`). Nobody
        // keeps it, so the price of each length, the multi-year prices, the premium for expired names,
        // the 63-character cap and the 5-year limit are fixed for good. The admin can still raise or
        // lower all prices together, on the oracle.
        hub.registrar.renounceOwnership();
        hexRegistry.grantRootRoles(
            RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_RENEW, address(hub.registrar)
        );

        hub.mirrorSync = new HexMirrorSync(cfg.amb, cfg.ethereumChainId, cfg.deployer, hexRegistry, cfg.mirrorGas);
        hub.orderFiller = new HexOrderFiller(
            cfg.amb,
            cfg.ethereumChainId,
            cfg.deployer,
            hub.registrar,
            IHexMirrorSync(address(hub.mirrorSync)),
            cfg.usdc,
            cfg.settleGas
        );
        // The copy fee starts off: the admin turns it on by choosing the bot, once it runs.
        hub.checkout = new AnyTokenCheckout(
            hub.registrar,
            cfg.usdc,
            cfg.wpls,
            cfg.routers,
            IHexMirrorSync(address(hub.mirrorSync)),
            cfg.admin,
            address(0),
            MAX_COPY_FEE_DOLLARS * 10 ** IERC20Metadata(address(cfg.usdc)).decimals()
        );

        // Hand over: the admin may add registrars and renewers later (a registrar can register a
        // name that has expired, even one still in its grace period), may hand held reserved names
        // to their owners, may restyle the name cards (cosmetic: it changes no name), and may add
        // new endings to the root. It can give up each of these powers, handing out reserved names
        // included. Then the deployer gives up everything.
        hexRegistry.grantRootRoles(
            RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_RENEW_ADMIN
                | RegistryRolesLib.ROLE_REGISTER_RESERVED | RegistryRolesLib.ROLE_REGISTER_RESERVED_ADMIN
                | RegistryRolesLib.ROLE_SET_URI | RegistryRolesLib.ROLE_SET_URI_ADMIN,
            cfg.admin
        );
        hub.core.rootRegistry
            .grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN, cfg.admin);
        _renounce(hub.core, cfg.deployer, hexRegistryRoles);
    }

    // ------------------------------------------------------------------------------------------
    // Ethereum
    // ------------------------------------------------------------------------------------------

    /// @dev Deploys the Ethereum side. The two bridge contracts still need `link`ing to their
    ///      PulseChain partners afterwards, by `cfg.deployer`.
    function _deployMirror(MirrorConfig memory cfg) internal returns (Mirror memory mirror) {
        uint256 hexRegistryRoles = RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_UNREGISTER_ADMIN
            | RegistryRolesLib.ROLE_RENEW_ADMIN | RegistryRolesLib.ROLE_SET_PARENT
            | RegistryRolesLib.ROLE_SET_PARENT_ADMIN | RegistryRolesLib.ROLE_SET_URI
            | RegistryRolesLib.ROLE_SET_URI_ADMIN;
        mirror.core = _deployCore(cfg.deployer, cfg.admin, hexRegistryRoles, true);

        mirror.mirrorRegistrar =
            new HexMirrorRegistrar(cfg.amb, cfg.pulsechainChainId, cfg.deployer, mirror.core.hexRegistry);
        mirror.core.hexRegistry
            .grantRootRoles(
                RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_UNREGISTER | RegistryRolesLib.ROLE_RENEW,
                address(mirror.mirrorRegistrar)
            );
        mirror.orderBook = new HexOrderBook(
            cfg.amb,
            cfg.pulsechainChainId,
            cfg.deployer,
            cfg.usdc,
            cfg.weth,
            cfg.routers,
            cfg.fillWindow,
            cfg.reclaimDelay
        );

        // Nobody but `HexMirrorRegistrar` may ever write the Ethereum copy, so no admin is kept.
        _renounce(mirror.core, cfg.deployer, hexRegistryRoles);
    }

    // ------------------------------------------------------------------------------------------
    // Shared
    // ------------------------------------------------------------------------------------------

    /// @dev The app's address for a name's page on chain `chainId`, which "<label>.hex" is added to:
    ///      the app on PulseChain and Ethereum, the testnet copy of the site on their testnets.
    function _appUrl(uint256 chainId) internal pure returns (string memory) {
        return chainId == 369 || chainId == 1 ? "https://app.hexns.domains/" : "https://hexns-testnet.netlify.app/app/";
    }

    /// @dev Deploys the ENSv2 contracts both chains have, with `hex` registered in the root under
    ///      no roles: nobody can ever replace the .hex registry or its default resolver.
    function _deployCore(address deployer, address admin, uint256 hexRegistryRoles, bool ethereumCopy)
        internal
        returns (Core memory core)
    {
        ContractNamer namerImplementation = new ContractNamer();
        core.contractNamer = IContractNamer(
            address(new ERC1967Proxy(address(namerImplementation), abi.encodeCall(ContractNamer.initialize, (admin))))
        );
        core.labelStore = new LabelStore(core.contractNamer);
        core.rootRegistry = new PermissionedRegistry(
            ILabelStore(address(core.labelStore)),
            deployer,
            RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN
        );
        core.hexRegistry = new PermissionedRegistry(ILabelStore(address(core.labelStore)), deployer, hexRegistryRoles);
        // Each name's card, as ENS's metadata service gives .eth names: without one, wallets and
        // marketplaces would show a bare token number.
        core.nameCard = new HexNameCard(_appUrl(block.chainid), ethereumCopy);
        core.hexRegistry.setURI("", core.nameCard);
        core.ownerResolver = new OwnerResolver(IRegistry(address(core.rootRegistry)));

        // The `hex` token goes to the admin with no roles: it cannot be transferred, and holding it
        // gives no say over the .hex registry or its resolver.
        core.rootRegistry
            .register(TLD, admin, IRegistry(address(core.hexRegistry)), address(core.ownerResolver), 0, MAX_EXPIRY);
        core.hexRegistry.setParent(IRegistry(address(core.rootRegistry)), TLD);

        string[] memory urls = new string[](1);
        urls[0] = "x-batch-gateway:true";
        core.batchGatewayProvider = new GatewayProvider(admin, urls);
        core.universalResolver = new UniversalResolverV2(
            IPermissionedRegistry(address(core.rootRegistry)),
            IGatewayProvider(address(core.batchGatewayProvider)),
            core.contractNamer
        );
        // Through SafeVerifiableFactory, so the proxy logic every owner's resolver forwards to can't
        // be initialized by anyone else (and on PulseChain, destroyed).
        core.verifiableFactory = new SafeVerifiableFactory().FACTORY();
        core.resolverImplementation = new PermissionedResolver(admin);
    }

    /// @dev Sets aside `names` in the .hex registry. A name with an owner is registered to it with
    ///      the roles a buyer gets. A name without one is held (ENSv2's RESERVED status): the
    ///      registrar won't sell it, and only the admin can hand it to an owner, keeping the same
    ///      expiry. Both last `RESERVATION_PERIOD`. The deployer is a registrar only while doing this.
    function _reserve(PermissionedRegistry registry, address deployer, ReservedName[] memory names) internal {
        if (names.length == 0) return;
        registry.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR, deployer);
        uint64 expiry = uint64(block.timestamp) + RESERVATION_PERIOD;
        for (uint256 i = 0; i < names.length; ++i) {
            ReservedNames.requireValidLabel(names[i].label);
            address owner = names[i].owner;
            registry.register(
                names[i].label,
                owner,
                IRegistry(address(0)),
                address(0),
                owner == address(0) ? 0 : REGISTRATION_ROLE_BITMAP,
                expiry
            );
        }
        registry.revokeRootRoles(RegistryRolesLib.ROLE_REGISTRAR, deployer);
    }

    /// @dev The deployer gives up every role it held on the two registries.
    function _renounce(Core memory core, address deployer, uint256 hexRegistryRoles) internal {
        core.hexRegistry.revokeRootRoles(hexRegistryRoles, deployer);
        core.rootRegistry
            .revokeRootRoles(RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN, deployer);
    }

    /// @dev Base prices per second, in standard units, by length (index 0 = 1 character).
    function _baseRates() internal pure returns (uint256[] memory rates) {
        rates = new uint256[](5);
        rates[2] = _perSecond(YEARLY_PRICE_3);
        rates[3] = _perSecond(YEARLY_PRICE_4);
        rates[4] = _perSecond(YEARLY_PRICE_5_PLUS);
    }

    /// @dev Rounded down: the oracle's rounding up of the amount to pay then lands exactly on the
    ///      price (rounding up here, as ENS does, would land a unit above it).
    function _perSecond(uint256 dollarsPerYear) internal pure returns (uint256) {
        return PRICE_SCALE * dollarsPerYear / SEC_PER_YEAR;
    }

    function _discountPoints() internal pure returns (DiscountPoint[] memory points) {
        // From 2 years the whole price is 3/4 of full (1.5 years' price), from 3 years 7/12 (1.75),
        // from 4 years 15/32 (1.875), and at 5 years 2/5 (2): 5 years for the price of 2.
        points = new DiscountPoint[](4);
        points[0] = DiscountPoint({duration: uint64(2 * SEC_PER_YEAR), numer: DISCOUNT_DENOMINATOR / 4 * 3});
        points[1] = DiscountPoint({duration: uint64(3 * SEC_PER_YEAR), numer: DISCOUNT_DENOMINATOR / 12 * 7});
        points[2] = DiscountPoint({duration: uint64(4 * SEC_PER_YEAR), numer: DISCOUNT_DENOMINATOR / 32 * 15});
        points[3] = DiscountPoint({duration: uint64(5 * SEC_PER_YEAR), numer: DISCOUNT_DENOMINATOR / 5 * 2});
    }

    /// @dev Exchange rates from standard units (PRICE_DECIMALS) to each stablecoin's own decimals.
    function _paymentRatios(IERC20 usdc, IERC20 dai) internal view returns (PaymentRatio[] memory ratios) {
        ratios = new PaymentRatio[](2);
        ratios[0] = _ratio(usdc);
        ratios[1] = _ratio(dai);
    }

    function _ratio(IERC20 token) internal view returns (PaymentRatio memory) {
        uint8 decimals = IERC20Metadata(address(token)).decimals();
        uint128 numer = decimals > PRICE_DECIMALS ? uint128(10 ** (decimals - PRICE_DECIMALS)) : 1;
        uint128 denom = decimals < PRICE_DECIMALS ? uint128(10 ** (PRICE_DECIMALS - decimals)) : 1;
        return PaymentRatio({paymentToken: token, numer: numer, denom: denom});
    }
}
