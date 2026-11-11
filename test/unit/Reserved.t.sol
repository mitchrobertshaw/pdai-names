// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";

import {IEnhancedAccessControl} from "@ensv2/access-control/interfaces/IEnhancedAccessControl.sol";
import {REGISTRATION_ROLE_BITMAP} from "@ensv2/registrar/ETHRegistrar.sol";
import {IETHRegistrar} from "@ensv2/registrar/interfaces/IETHRegistrar.sol";
import {IPermissionedRegistry} from "@ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensv2/registry/libraries/RegistryRolesLib.sol";

import {ReservedName, ReservedNames} from "../../script/ReservedNames.sol";
import {AnyTokenCheckout} from "../../src/AnyTokenCheckout.sol";
import {PdaiTestBase} from "../helpers/PdaiTestBase.sol";

/// @notice Names set aside at deployment: one given straight to its owner's wallet, one held until
///         the admin hands it over.
contract ReservedTest is PdaiTestBase {
    uint256 internal constant ROOT = 0;
    uint64 internal constant DEPLOYED_AT = 1_800_000_000; // PdaiTestBase deploys at this time

    address internal sommi = makeAddr("sommi");
    address internal claimant = makeAddr("claimant");

    function _reservedNames() internal view override returns (ReservedName[] memory names) {
        names = new ReservedName[](2);
        names[0] = ReservedName("yourfriendsommi", sommi); // given
        names[1] = ReservedName("pulsechain", address(0)); // held
    }

    function _state(string memory label) internal view returns (IPermissionedRegistry.State memory) {
        return deployed.pdaiRegistry.getState(_labelId(label));
    }

    /// @dev What the admin sends to hand over a held name: no subregistry, the default resolver,
    ///      a buyer's roles, and expiry 0 to keep the reservation's expiry.
    function _handOver(string memory label, address to) internal {
        vm.prank(admin);
        deployed.pdaiRegistry.register(label, to, IRegistry(address(0)), address(0), REGISTRATION_ROLE_BITMAP, 0);
    }

    // ------------------------------------------------------------------------------------------
    // Given: a name with a wallet
    // ------------------------------------------------------------------------------------------

    function test_given_belongsToItsWalletFromTheStart() public view {
        IPermissionedRegistry.State memory s = _state("yourfriendsommi");
        assertEq(uint8(s.status), uint8(IPermissionedRegistry.Status.REGISTERED));
        assertEq(s.latestOwner, sommi);
        assertEq(s.expiry, DEPLOYED_AT + RESERVATION_PERIOD);
        assertEq(_resolveEthAddr("yourfriendsommi.pdai"), sommi);
        assertEq(_resolveAddr("yourfriendsommi.pdai", deployed.ownerResolver.COIN_TYPE_PULSECHAIN()), sommi);
    }

    function test_given_ownerHasABuyersRights() public {
        uint256 tokenId = _state("yourfriendsommi").tokenId;
        vm.prank(sommi);
        deployed.pdaiRegistry.setResolver(tokenId, address(0xBEEF));
        assertEq(deployed.pdaiRegistry.getResolver("yourfriendsommi"), address(0xBEEF));

        tokenId = _state("yourfriendsommi").tokenId;
        vm.prank(sommi);
        deployed.pdaiRegistry.safeTransferFrom(sommi, bob, tokenId, 1, "");
        assertEq(deployed.pdaiRegistry.findOwner("yourfriendsommi"), bob);
    }

    // ------------------------------------------------------------------------------------------
    // Held: a name without a wallet
    // ------------------------------------------------------------------------------------------

    function test_held_cannotBeBought() public {
        assertEq(uint8(_state("pulsechain").status), uint8(IPermissionedRegistry.Status.RESERVED));
        assertFalse(deployed.registrar.isAvailable("pulsechain"));

        AnyTokenCheckout.Registration memory r = _registration("pulsechain", alice, ONE_YEAR);
        _commit(r);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IETHRegistrar.NameNotAvailable.selector, "pulsechain"));
        deployed.registrar.register(r.label, r.owner, r.secret, r.subregistry, r.resolver, r.duration, plsUsdc, r.referrer);
    }

    function test_held_resolvesToNobody() public view {
        assertEq(_resolveEthAddr("pulsechain.pdai"), address(0));
    }

    function test_held_adminHandsItToItsOwner() public {
        _handOver("pulsechain", claimant);

        IPermissionedRegistry.State memory s = _state("pulsechain");
        assertEq(uint8(s.status), uint8(IPermissionedRegistry.Status.REGISTERED));
        assertEq(s.latestOwner, claimant);
        assertEq(s.expiry, DEPLOYED_AT + RESERVATION_PERIOD, "keeps the reservation's expiry");
        assertEq(_resolveEthAddr("pulsechain.pdai"), claimant);

        // The new owner has a buyer's rights, so can move it on.
        vm.prank(claimant);
        deployed.pdaiRegistry.safeTransferFrom(claimant, bob, s.tokenId, 1, "");
        assertEq(deployed.pdaiRegistry.findOwner("pulsechain"), bob);
        assertEq(_resolveEthAddr("pulsechain.pdai"), bob);
    }

    function test_held_onlyTheAdminCanHandItOver() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector,
                ROOT,
                RegistryRolesLib.ROLE_REGISTER_RESERVED,
                alice
            )
        );
        deployed.pdaiRegistry
            .register("pulsechain", alice, IRegistry(address(0)), address(0), REGISTRATION_ROLE_BITMAP, 0);
    }

    function test_held_handOverCannotTakeAnOwnedName() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSignature("LabelAlreadyRegistered(string)", "yourfriendsommi"));
        deployed.pdaiRegistry
            .register("yourfriendsommi", admin, IRegistry(address(0)), address(0), REGISTRATION_ROLE_BITMAP, 0);
    }

    function test_held_goesOnSaleIfNeverClaimed() public {
        vm.warp(DEPLOYED_AT + RESERVATION_PERIOD + GRACE_PERIOD + PREMIUM_PERIOD + 1);
        assertTrue(deployed.registrar.isAvailable("pulsechain"));
        _registerDirect("pulsechain", alice, ONE_YEAR);
        assertEq(deployed.pdaiRegistry.findOwner("pulsechain"), alice);
    }

    // ------------------------------------------------------------------------------------------
    // Roles
    // ------------------------------------------------------------------------------------------

    function test_deployerKeepsNoRolesAfterReserving() public view {
        assertEq(deployed.pdaiRegistry.roles(ROOT, address(this)), 0);
        assertEq(deployed.rootRegistry.roles(ROOT, address(this)), 0);
    }

    function test_readmeGivesTheRightRolesNumber() public pure {
        // The README tells admins to paste this number when handing over a held name.
        assertEq(REGISTRATION_ROLE_BITMAP, 97409655027181761882228017414928043058140282880);
    }
}

/// @notice Reading `script/reserved-names.csv`.
contract ReservedNamesFileTest is Test {
    /// @dev External, so `expectRevert` can catch what `parse` reverts with.
    function parse(string memory csv) external pure returns (ReservedName[] memory) {
        return ReservedNames.parse(csv);
    }

    function test_theListInTheRepoIsValid() public view {
        ReservedName[] memory names = ReservedNames.read(string.concat(vm.projectRoot(), "/script/reserved-names.csv"));
        assertGt(names.length, 0);
    }

    function test_parse_heldAndGivenNames() public view {
        ReservedName[] memory names = this.parse(
            "name,wallet,who\n" "PulseChain,,the chain itself\n"
            "  yourfriendsommi , 0xc6aB34235e4b2B7F42A3F6D78830E83760881667 , Your Friend Sommi\r\n" "\n"
        );
        assertEq(names.length, 2);
        assertEq(names[0].label, "pulsechain", "lower-cased, as wallets do");
        assertEq(names[0].owner, address(0), "no wallet: held");
        assertEq(names[1].label, "yourfriendsommi");
        assertEq(names[1].owner, 0xc6aB34235e4b2B7F42A3F6D78830E83760881667);
    }

    function test_parse_headerIsOptional() public view {
        ReservedName[] memory names = this.parse("alice,,\nbob,,");
        assertEq(names.length, 2);
        assertEq(names[0].label, "alice");
    }

    function test_parse_rejectsBadRows() public {
        vm.expectRevert(bytes("\"ab\": a reserved name must be 3 to 63 characters"));
        this.parse("ab,,");
        vm.expectRevert(bytes("\"al.ice\": a reserved name may only use a-z, 0-9 and -"));
        this.parse("al.ice,,");
        vm.expectRevert(bytes("\"ab--c\": a name can't have hyphens in both the 3rd and 4th place"));
        this.parse("ab--c,,");
        vm.expectRevert(bytes("alice is listed twice"));
        this.parse("alice,,\nAlice,,");
        vm.expectRevert(bytes("alice: the wallet is the zero address"));
        this.parse("alice,0x0000000000000000000000000000000000000000,");
        vm.expectRevert(); // not an address
        this.parse("alice,0x1234,");
    }
}
