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

import {AnyTokenCheckout} from "../src/AnyTokenCheckout.sol";
import {OwnerResolver} from "../src/OwnerResolver.sol";
import {PdaiNameCard} from "../src/PdaiNameCard.sol";
import {PdaiNameRules} from "../src/PdaiNameRules.sol";
import {SafeVerifiableFactory} from "../src/SafeVerifiableFactory.sol";
import {ReservedName, ReservedNames} from "./ReservedNames.sol";

/// @title PdaiDeployer
/// @notice Deploys .pdai on PulseChain: ENSv2 with a `pdai` ending, and a checkout that takes any
///         token. Used by the deploy script and by the tests, so the tests run against exactly what
///         gets deployed.
/// @dev Settings follow ENSv2's own deployment (contracts-v2 script/deploy-constants.ts) except
///      the price of 5+ letter names: $10 a year, as HexNS charges for .hex, instead of ENS's $8;
///      and the oracle's finer units, which make every price exact (see PRICE_DECIMALS).
abstract contract PdaiDeployer {
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
    uint256 internal constant YEARLY_PRICE_5_PLUS = 10;
    /// @dev A name that just expired starts at $100 million and halves daily for 21 days, so
    ///      nobody can snipe it the moment it lapses.
    uint256 internal constant PREMIUM_PRICE_INITIAL = PRICE_SCALE * 100_000_000;
    uint64 internal constant PREMIUM_HALVING_PERIOD = 1 days;
    uint64 internal constant PREMIUM_PERIOD = 21 days;
    /// @dev Multi-year prices, as a share of the full price: 2 years cost 1.5 years' price, 3 cost
    ///      1.75, 4 cost 1.875 and 5 cost 2, so 5 years cost the same as 2. PdaiNameRules stops at 5.
    uint128 internal constant DISCOUNT_DENOMINATOR = 1e38;

    /// @dev How long reserved names last from deployment. A held name can't be bought for that
    ///      long unless the admin hands it over; a given name is paid up for that long. The admin
    ///      can extend either.
    uint64 internal constant RESERVATION_PERIOD = 5 * 365 days;

    uint64 internal constant MAX_EXPIRY = type(uint64).max;
    uint256 internal constant PULSECHAIN_CHAIN_ID = 369;
    uint256 internal constant PULSECHAIN_TESTNET_CHAIN_ID = 943;
    string internal constant TLD = "pdai";

    /// @notice Everything .pdai is made of.
    struct Deployment {
        // Names, and looking them up: ENSv2's contracts.
        IContractNamer contractNamer; // UUPS proxy, owned by the admin
        LabelStore labelStore;
        PermissionedRegistry rootRegistry;
        PermissionedRegistry pdaiRegistry; // where names live
        OwnerResolver ownerResolver; // resolver of `pdai`: names resolve to their owner by default
        GatewayProvider batchGatewayProvider;
        UniversalResolverV2 universalResolver; // what wallets and apps look names up through
        VerifiableFactory verifiableFactory; // deploys owners' own resolvers
        PermissionedResolver resolverImplementation;
        PdaiNameCard nameCard; // what wallets and marketplaces show for each name
        // Selling names.
        StandardRentPriceOracle oracle; // prices; the admin manages it
        PdaiNameRules rules; // between the registrar and the oracle: plain names of 63 characters at most, 5 years ahead at most
        ETHRegistrar registrar;
        AnyTokenCheckout checkout; // buys and renews with any token or PLS
    }

    struct Config {
        address deployer; // the account sending the deployment; gives up its roles at the end
        address admin; // may raise or lower all prices, change payment tokens and add registrars; can't take names
        address beneficiary; // receives every registration and renewal payment
        IERC20 usdc; // USDC bridged from Ethereum: accepted by the registrar, used by the checkout
        IERC20 dai; // DAI bridged from Ethereum: also accepted by the registrar
        IERC20 wpls;
        address[] routers; // PulseX routers for the checkout
        ReservedName[] reserved; // set aside before anyone can buy names (see `_reserve`)
    }

    /// @dev Deploys .pdai. When it returns, the deployer holds no roles and the admin holds only
    ///      what's listed at the end.
    function _deploy(Config memory cfg) internal returns (Deployment memory d) {
        // The .pdai registry: the deployer may grant the registrar, renewer and reserved-name roles
        // and set the parent, nothing more. In particular nobody gets the roles to unregister,
        // transfer, or change the resolver of someone else's name.
        uint256 pdaiRegistryRoles = RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_RENEW_ADMIN
            | RegistryRolesLib.ROLE_REGISTER_RESERVED_ADMIN | RegistryRolesLib.ROLE_SET_PARENT
            | RegistryRolesLib.ROLE_SET_PARENT_ADMIN | RegistryRolesLib.ROLE_SET_URI
            | RegistryRolesLib.ROLE_SET_URI_ADMIN;
        _deployNaming(d, cfg.deployer, cfg.admin, pdaiRegistryRoles);
        PermissionedRegistry pdaiRegistry = d.pdaiRegistry;

        // Before the registrar exists, so nobody can buy a reserved name first.
        _reserve(pdaiRegistry, cfg.deployer, cfg.reserved);

        d.oracle = new StandardRentPriceOracle(
            cfg.admin,
            _baseRates(),
            _discountPoints(),
            DISCOUNT_DENOMINATOR,
            PREMIUM_PRICE_INITIAL,
            PREMIUM_HALVING_PERIOD,
            PREMIUM_PERIOD,
            _paymentRatios(cfg.usdc, cfg.dai)
        );
        d.rules = new PdaiNameRules(IRentPriceOracle(address(d.oracle)));
        d.registrar = new ETHRegistrar(
            cfg.deployer,
            pdaiRegistry,
            cfg.beneficiary,
            IRentPriceOracle(address(d.rules)),
            GRACE_PERIOD,
            MIN_COMMITMENT_AGE,
            MAX_COMMITMENT_AGE,
            MIN_REGISTER_DURATION
        );
        // The registrar's one owner power is swapping its price list (`setRentPriceOracle`). Nobody
        // keeps it, so the price of each length, the multi-year prices, the premium for expired names,
        // the 63-character cap and the 5-year limit are fixed for good. The admin can still raise or
        // lower all prices together, on the oracle.
        d.registrar.renounceOwnership();
        pdaiRegistry.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_RENEW, address(d.registrar));

        d.checkout = new AnyTokenCheckout(d.registrar, cfg.usdc, cfg.wpls, cfg.routers);

        // Hand over: the admin may add registrars and renewers later (a registrar can register a
        // name that has expired, even one still in its grace period), may hand held reserved names
        // to their owners, may restyle the name cards (cosmetic: it changes no name), and may add
        // new endings to the root. It can give up each of these powers, handing out reserved names
        // included. Then the deployer gives up everything.
        pdaiRegistry.grantRootRoles(
            RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_RENEW_ADMIN
                | RegistryRolesLib.ROLE_REGISTER_RESERVED | RegistryRolesLib.ROLE_REGISTER_RESERVED_ADMIN
                | RegistryRolesLib.ROLE_SET_URI | RegistryRolesLib.ROLE_SET_URI_ADMIN,
            cfg.admin
        );
        d.rootRegistry.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN, cfg.admin);
        pdaiRegistry.revokeRootRoles(pdaiRegistryRoles, cfg.deployer);
        d.rootRegistry
            .revokeRootRoles(RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN, cfg.deployer);
    }

    /// @dev The app's address for a name's page, which "<label>.pdai" is added to: the app on
    ///      PulseChain, the testnet copy of the site on its testnet.
    function _appUrl(uint256 chainId) internal pure returns (string memory) {
        return chainId == PULSECHAIN_CHAIN_ID ? "https://app.pdai.domains/" : "https://pdai-domains-testnet.netlify.app/app/";
    }

    /// @dev Deploys ENSv2's naming contracts into `d`, with `pdai` registered in the root under no
    ///      roles: nobody can ever replace the .pdai registry or its default resolver.
    function _deployNaming(Deployment memory d, address deployer, address admin, uint256 pdaiRegistryRoles) internal {
        ContractNamer namerImplementation = new ContractNamer();
        d.contractNamer = IContractNamer(
            address(new ERC1967Proxy(address(namerImplementation), abi.encodeCall(ContractNamer.initialize, (admin))))
        );
        d.labelStore = new LabelStore(d.contractNamer);
        d.rootRegistry = new PermissionedRegistry(
            ILabelStore(address(d.labelStore)),
            deployer,
            RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN
        );
        d.pdaiRegistry = new PermissionedRegistry(ILabelStore(address(d.labelStore)), deployer, pdaiRegistryRoles);
        // Each name's card, as ENS's metadata service gives .eth names: without one, wallets and
        // marketplaces would show a bare token number.
        d.nameCard = new PdaiNameCard(_appUrl(block.chainid));
        d.pdaiRegistry.setURI("", d.nameCard);
        d.ownerResolver = new OwnerResolver(IRegistry(address(d.rootRegistry)));

        // The `pdai` token goes to the admin with no roles: it cannot be transferred, and holding it
        // gives no say over the .pdai registry or its resolver.
        d.rootRegistry
            .register(TLD, admin, IRegistry(address(d.pdaiRegistry)), address(d.ownerResolver), 0, MAX_EXPIRY);
        d.pdaiRegistry.setParent(IRegistry(address(d.rootRegistry)), TLD);

        string[] memory urls = new string[](1);
        urls[0] = "x-batch-gateway:true";
        d.batchGatewayProvider = new GatewayProvider(admin, urls);
        d.universalResolver = new UniversalResolverV2(
            IPermissionedRegistry(address(d.rootRegistry)),
            IGatewayProvider(address(d.batchGatewayProvider)),
            d.contractNamer
        );
        // Through SafeVerifiableFactory, so the proxy logic every owner's resolver forwards to can't
        // be initialized by anyone else (and, as PulseChain lacks EIP-6780, destroyed).
        d.verifiableFactory = new SafeVerifiableFactory().FACTORY();
        d.resolverImplementation = new PermissionedResolver(admin);
    }

    /// @dev Sets aside `names` in the .pdai registry. A name with an owner is registered to it with
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
