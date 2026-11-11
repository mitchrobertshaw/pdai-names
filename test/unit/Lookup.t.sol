// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {EACBaseRolesLib} from "@ensv2/access-control/libraries/EACBaseRolesLib.sol";
import {PermissionedResolver} from "@ensv2/resolver/PermissionedResolver.sol";

import {OwnerResolver} from "../../src/OwnerResolver.sol";
import {PdaiTestBase} from "../helpers/PdaiTestBase.sol";

/// @notice Looking names up: every name resolves to its owner from the moment it is registered,
///         until its owner points it somewhere else.
contract LookupTest is PdaiTestBase {
    uint256 internal constant COIN_TYPE_ETH = 60;
    uint256 internal constant COIN_TYPE_DEFAULT = 1 << 31;
    uint256 internal constant COIN_TYPE_PULSECHAIN = (1 << 31) | 369;
    uint256 internal constant COIN_TYPE_BTC = 0;

    function test_lookup_resolvesToOwnerStraightAway() public {
        _registerDirect("alice", alice, ONE_YEAR);
        assertEq(_resolveEthAddr("alice.pdai"), alice, "addr(node), what wallets ask by default");
        assertEq(_resolveAddr("alice.pdai", COIN_TYPE_ETH), alice, "coin type 60");
        assertEq(_resolveAddr("alice.pdai", COIN_TYPE_PULSECHAIN), alice, "PulseChain");
        assertEq(_resolveAddr("alice.pdai", COIN_TYPE_DEFAULT), alice, "default EVM");
        assertEq(_resolveAddr("alice.pdai", COIN_TYPE_BTC), address(0), "not an EVM chain");
    }

    function test_lookup_unregisteredName_resolvesToNothing() public view {
        assertEq(_resolveEthAddr("nobody.pdai"), address(0));
    }

    function test_lookup_expiredName_resolvesToNothing() public {
        _registerDirect("alice", alice, ONE_YEAR);
        vm.warp(block.timestamp + ONE_YEAR + 1);
        assertEq(_resolveEthAddr("alice.pdai"), address(0));
    }

    function test_lookup_followsATransfer() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        vm.prank(alice);
        deployed.pdaiRegistry.safeTransferFrom(alice, bob, tokenId, 1, "");
        assertEq(_resolveEthAddr("alice.pdai"), bob);
    }

    function test_lookup_renewalInGraceKeepsTheOwnersSettings() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        vm.prank(alice);
        deployed.pdaiRegistry.setResolver(tokenId, address(0xCAFE));

        // It lapses for an hour, and alice renews it in its grace period.
        vm.warp(block.timestamp + ONE_YEAR + 1 hours);
        uint256 price = deployed.registrar.getRenewPrice("alice", 5 * ONE_YEAR, plsUsdc);
        plsUsdc.mint(alice, price);
        vm.startPrank(alice);
        plsUsdc.approve(address(deployed.registrar), price);
        deployed.registrar.renew("alice", 5 * ONE_YEAR, plsUsdc, bytes32(0));
        vm.stopPrank();

        assertEq(deployed.pdaiRegistry.findOwner("alice"), alice);
        assertEq(deployed.pdaiRegistry.getResolver("alice"), address(0xCAFE), "her settings stay");
    }

    function test_lookup_newOwnerAfterLapseStartsAfresh() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        vm.prank(alice);
        deployed.pdaiRegistry.setResolver(tokenId, address(0xBEEF));

        // It lapses for good, and bob buys it: none of alice's settings come with it.
        vm.warp(block.timestamp + ONE_YEAR + 60 days);
        _registerDirect("alice", bob, ONE_YEAR);
        assertEq(deployed.pdaiRegistry.getResolver("alice"), address(0));
        assertEq(_resolveEthAddr("alice.pdai"), bob);
    }

    function test_lookup_ownersOwnResolverWins() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        address wallet = makeAddr("alice's other wallet");
        vm.startPrank(alice);
        PermissionedResolver resolver = PermissionedResolver(
            deployed.verifiableFactory
                .deployProxy(
                    address(deployed.resolverImplementation),
                    1,
                    abi.encodeCall(PermissionedResolver.initialize, (alice, EACBaseRolesLib.ALL_ROLES, new bytes[](0)))
                )
        );
        resolver.setAddr(_node("alice.pdai"), COIN_TYPE_ETH, abi.encodePacked(wallet));
        resolver.setText(_node("alice.pdai"), "com.twitter", "alice");
        deployed.pdaiRegistry.setResolver(tokenId, address(resolver));
        vm.stopPrank();
        assertEq(_resolveEthAddr("alice.pdai"), wallet);
    }

    function test_ownerResolver_rejectsOtherRecords() public {
        _registerDirect("alice", alice, ONE_YEAR);
        bytes memory textCall = abi.encodeWithSignature("text(bytes32,string)", _node("alice.pdai"), "avatar");
        vm.expectRevert(abi.encodeWithSelector(OwnerResolver.UnsupportedResolverProfile.selector, bytes4(textCall)));
        deployed.ownerResolver.resolve(_dns("alice.pdai"), textCall);
    }
}
