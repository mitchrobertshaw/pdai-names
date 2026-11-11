// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRentPriceOracle} from "@ensv2/registrar/interfaces/IRentPriceOracle.sol";
import {IPermissionedRegistry} from "@ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensv2/registry/libraries/RegistryRolesLib.sol";
import {EACBaseRolesLib} from "@ensv2/access-control/libraries/EACBaseRolesLib.sol";
import {IEnhancedAccessControl} from "@ensv2/access-control/interfaces/IEnhancedAccessControl.sol";
import {UUPSProxyLogic} from "@ensdomains/verifiable-factory/UUPSProxyLogic.sol";

import {PdaiTestBase} from "../helpers/PdaiTestBase.sol";

/// @dev What someone would try to run in place of the resolver factory's shared proxy logic.
contract SelfDestructor {
    function canUpgradeFrom(address) external pure returns (bool) {
        return true;
    }

    function boom() external {
        selfdestruct(payable(msg.sender));
    }
}

/// @notice The deployment itself: prices, who holds which roles, and that nobody can take names.
contract DeploymentTest is PdaiTestBase {
    uint256 internal constant ROOT = 0;

    // ------------------------------------------------------------------------------------------
    // Prices
    // ------------------------------------------------------------------------------------------

    function test_prices_byLength() public view {
        (uint256 base5,) = deployed.registrar.getRegisterPrice("alice", ONE_YEAR, plsUsdc);
        (uint256 base4,) = deployed.registrar.getRegisterPrice("four", ONE_YEAR, plsUsdc);
        (uint256 base3,) = deployed.registrar.getRegisterPrice("abc", ONE_YEAR, plsUsdc);
        assertEq(base5, 10e6, "5+ letters: exactly $10 a year");
        assertEq(base4, 160e6, "4 letters: exactly $160 a year");
        assertEq(base3, 320e6, "3 letters: exactly $320 a year");
    }

    function test_prices_sameInDai() public view {
        (uint256 usdc,) = deployed.registrar.getRegisterPrice("alice", ONE_YEAR, plsUsdc);
        (uint256 dai,) = deployed.registrar.getRegisterPrice("alice", ONE_YEAR, plsDai);
        assertEq(dai, usdc * 1e12, "exactly the same price in DAI");
    }

    /// @dev Every price is exact to the last unit, for buying and renewing alike: what the app
    ///      shows is what a wallet pays, so one holding exactly the price can pay it.
    function test_prices_exactForEveryLengthAndTerm() public {
        string[3] memory labels = ["abc", "four", "alice"];
        string[3] memory renewing = ["xyz", "wxyz", "bobby"];
        uint256[3] memory yearly = [uint256(320), 160, 10];
        // Each term's share of a year's price, in eighths: 1, 1.5, 1.75, 1.875 and 2 years' worth.
        uint256[6] memory eighths = [uint256(0), 8, 12, 14, 15, 16];
        for (uint256 i = 0; i < 3; ++i) {
            // Paid up 28 days ahead, so it can be renewed for up to 4 more years.
            _registerDirect(renewing[i], alice, MIN_REGISTER_DURATION);
            for (uint64 y = 1; y <= 5; ++y) {
                uint256 usdcPrice = yearly[i] * 1e6 * eighths[y] / 8;
                (uint256 usdc, uint256 premium) = deployed.registrar.getRegisterPrice(labels[i], y * ONE_YEAR, plsUsdc);
                (uint256 dai,) = deployed.registrar.getRegisterPrice(labels[i], y * ONE_YEAR, plsDai);
                assertEq(premium, 0);
                assertEq(usdc, usdcPrice, "to buy, in USDC");
                assertEq(dai, usdcPrice * 1e12, "to buy, in DAI");
                if (y < 5) {
                    assertEq(
                        deployed.registrar.getRenewPrice(renewing[i], y * ONE_YEAR, plsUsdc), usdcPrice, "to renew, in USDC"
                    );
                }
            }
        }
    }

    function test_prices_shortNamesNotForSale() public {
        vm.expectRevert(abi.encodeWithSelector(IRentPriceOracle.NotValid.selector, "ab"));
        deployed.registrar.getRegisterPrice("ab", ONE_YEAR, plsUsdc);
        vm.expectRevert(abi.encodeWithSelector(IRentPriceOracle.NotValid.selector, "a"));
        deployed.registrar.getRegisterPrice("a", ONE_YEAR, plsUsdc);
    }

    function test_prices_multiYear_fiveForThePriceOfTwo() public view {
        // In dollars, for a 3-character name ($320 a year): 320, 480, 560, 600, 640.
        uint256[6] memory expected = [uint256(0), 320e6, 480e6, 560e6, 600e6, 640e6];
        uint256 previous;
        for (uint64 y = 1; y <= 5; ++y) {
            (uint256 base,) = deployed.registrar.getRegisterPrice("abc", y * ONE_YEAR, plsUsdc);
            assertEq(base, expected[y], "3 characters");
            assertGt(base, previous, "more years always cost more in all");
            previous = base;
        }
        (uint256 five5,) = deployed.registrar.getRegisterPrice("alice", 5 * ONE_YEAR, plsUsdc);
        (uint256 five4,) = deployed.registrar.getRegisterPrice("four", 5 * ONE_YEAR, plsUsdc);
        assertEq(five5, 20e6, "5+ characters: $20 for 5 years");
        assertEq(five4, 320e6, "4 characters: $320 for 5 years");
    }

    function test_prices_onlyStablecoinsAccepted() public {
        vm.expectRevert(abi.encodeWithSelector(IRentPriceOracle.PaymentTokenNotSupported.selector, wpls));
        deployed.registrar.getRegisterPrice("alice", ONE_YEAR, IERC20(address(wpls)));
    }

    // ------------------------------------------------------------------------------------------
    // Roles
    // ------------------------------------------------------------------------------------------

    function test_roles_deployerKeepsNothing() public view {
        assertEq(deployed.rootRegistry.roles(ROOT, address(this)), 0, "root registry");
        assertEq(deployed.pdaiRegistry.roles(ROOT, address(this)), 0, ".pdai registry");
    }

    function test_roles_registrarCanOnlyRegisterAndRenew() public view {
        assertEq(
            deployed.pdaiRegistry.roles(ROOT, address(deployed.registrar)),
            RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_RENEW
        );
    }

    function test_roles_adminCannotUnregisterOrMoveNames() public view {
        uint256 adminRoles = deployed.pdaiRegistry.roles(ROOT, admin);
        assertEq(
            adminRoles,
            RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_RENEW_ADMIN
                | RegistryRolesLib.ROLE_REGISTER_RESERVED | RegistryRolesLib.ROLE_REGISTER_RESERVED_ADMIN
                | RegistryRolesLib.ROLE_SET_URI | RegistryRolesLib.ROLE_SET_URI_ADMIN
        );
        uint256 dangerous = RegistryRolesLib.ROLE_UNREGISTER | RegistryRolesLib.ROLE_UNREGISTER_ADMIN
            | RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN
            | RegistryRolesLib.ROLE_SET_SUBREGISTRY | RegistryRolesLib.ROLE_SET_SUBREGISTRY_ADMIN
            | RegistryRolesLib.ROLE_CAN_TRANSFER_ADMIN;
        assertEq(adminRoles & dangerous, 0);
    }

    function test_roles_nobodyCanSwapThePrices() public {
        // The registrar's one owner power is swapping its price list, and nobody has it: not the
        // admin, not the deployer. Prices per length, discounts, the premium and the cap stay.
        assertEq(deployed.registrar.owner(), address(0));
        address[2] memory tried = [admin, address(this)];
        for (uint256 i = 0; i < tried.length; ++i) {
            vm.prank(tried[i]);
            vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, tried[i]));
            deployed.registrar.setRentPriceOracle(IRentPriceOracle(address(deployed.oracle)));
        }
        assertEq(address(deployed.registrar.rentPriceOracle()), address(deployed.rules));
    }

    function test_roles_adminCannotTakeAName() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);

        vm.startPrank(admin);
        // The admin may make itself a registrar, but a registrar cannot overwrite a live name...
        deployed.pdaiRegistry.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR, admin);
        vm.expectRevert(abi.encodeWithSignature("LabelAlreadyRegistered(string)", "alice"));
        deployed.pdaiRegistry
            .register("alice", admin, IRegistry(address(0)), address(0), 0, uint64(block.timestamp + 1 days));
        // ...and cannot give itself the roles to unregister it or change its resolver.
        vm.expectRevert();
        deployed.pdaiRegistry.grantRootRoles(RegistryRolesLib.ROLE_UNREGISTER, admin);
        vm.expectRevert();
        deployed.pdaiRegistry.unregister(tokenId);
        vm.expectRevert();
        deployed.pdaiRegistry.setResolver(tokenId, admin);
        vm.stopPrank();

        assertEq(deployed.pdaiRegistry.findOwner("alice"), alice);
    }

    function test_roles_pdaiEndingIsLocked() public {
        uint256 pdaiId = _labelId("pdai");
        assertEq(address(deployed.rootRegistry.getSubregistry("pdai")), address(deployed.pdaiRegistry));
        assertEq(deployed.rootRegistry.getResolver("pdai"), address(deployed.ownerResolver));
        assertEq(deployed.rootRegistry.findExpiry("pdai"), MAX_EXPIRY);
        // No one, not even the admin or the deployer, can replace the .pdai registry or resolver.
        vm.prank(admin);
        vm.expectRevert();
        deployed.rootRegistry.setSubregistry(pdaiId, IRegistry(admin));
        vm.prank(address(this));
        vm.expectRevert();
        deployed.rootRegistry.setResolver(pdaiId, admin);
    }

    function test_roles_adminCanGiveUpEveryPower() public {
        // Adding registrars and renewers, handing out held reserved names, restyling the name cards
        // and adding endings: the admin can give each of them up for good.
        vm.startPrank(admin);
        deployed.pdaiRegistry
            .revokeRootRoles(
                RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_RENEW_ADMIN
                    | RegistryRolesLib.ROLE_REGISTER_RESERVED | RegistryRolesLib.ROLE_REGISTER_RESERVED_ADMIN
                    | RegistryRolesLib.ROLE_SET_URI | RegistryRolesLib.ROLE_SET_URI_ADMIN,
                admin
            );
        deployed.rootRegistry
            .revokeRootRoles(RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN, admin);
        vm.stopPrank();
        assertEq(deployed.pdaiRegistry.roles(ROOT, admin), 0);
        assertEq(deployed.rootRegistry.roles(ROOT, admin), 0);
    }

    // ------------------------------------------------------------------------------------------
    // Owners' own resolvers
    // ------------------------------------------------------------------------------------------

    function test_resolverFactory_sharedLogicCantBeTakenOver() public {
        // Every resolver the factory makes forwards to one shared logic contract. Nobody can make it
        // run their own code (on PulseChain, code that deletes it and every resolver with it).
        address logic = deployed.verifiableFactory.proxyLogic();
        SelfDestructor boom = new SelfDestructor();
        vm.startPrank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSignature("AlreadyInitialized()"));
        UUPSProxyLogic(payable(logic)).initialize(address(boom), abi.encodeCall(SelfDestructor.boom, ()));
        vm.expectRevert();
        UUPSProxyLogic(payable(logic)).upgradeToAndCall(address(boom), abi.encodeCall(SelfDestructor.boom, ()));
        (bool ok,) = logic.call(abi.encodeCall(SelfDestructor.boom, ()));
        assertFalse(ok, "its fallback runs nothing");
        vm.stopPrank();
        assertGt(logic.code.length, 0);
    }

    function test_roles_checkoutHasNoOwner() public view {
        // It only swaps and pays the registrar: nobody, the admin included, has any say over it.
        (bool ok,) = address(deployed.checkout).staticcall(abi.encodeWithSignature("owner()"));
        assertFalse(ok, "no owner");
        assertEq(address(deployed.checkout.REGISTRAR()), address(deployed.registrar));
        assertEq(address(deployed.checkout.PAYMENT_TOKEN()), address(plsUsdc));
    }

    function test_roles_ownerCanTransfer() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        vm.prank(alice);
        deployed.pdaiRegistry.safeTransferFrom(alice, bob, tokenId, 1, "");
        assertEq(deployed.pdaiRegistry.findOwner("alice"), bob);
    }
}
