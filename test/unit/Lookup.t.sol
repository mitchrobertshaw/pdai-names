// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {EACBaseRolesLib} from "@ensv2/access-control/libraries/EACBaseRolesLib.sol";
import {IPermissionedRegistry} from "@ensv2/registry/interfaces/IPermissionedRegistry.sol";
import {PermissionedResolver} from "@ensv2/resolver/PermissionedResolver.sol";

import {BridgeLink} from "../../src/common/BridgeLink.sol";
import {OwnerResolver} from "../../src/common/OwnerResolver.sol";
import {HexMirrorRegistrar} from "../../src/ethereum/HexMirrorRegistrar.sol";
import {IHexMirrorReceiver} from "../../src/interfaces/IHexBridge.sol";
import {HexMirrorSync} from "../../src/pulsechain/HexMirrorSync.sol";
import {HexTestBase} from "../helpers/HexTestBase.sol";
import {PickyReceiver} from "../mocks/PickyReceiver.sol";

/// @notice Looking names up on both chains, and keeping the Ethereum copy in step with PulseChain.
contract MirrorTest is HexTestBase {
    uint256 internal constant COIN_TYPE_ETH = 60;
    uint256 internal constant COIN_TYPE_DEFAULT = 1 << 31;
    uint256 internal constant COIN_TYPE_PULSECHAIN = (1 << 31) | 369;
    uint256 internal constant COIN_TYPE_BTC = 0;

    function _syncAndRelay(string memory label) internal {
        hub.mirrorSync.sync(label);
        _relayToEthereum();
    }

    // ------------------------------------------------------------------------------------------
    // Lookups
    // ------------------------------------------------------------------------------------------

    function test_lookup_pulseChain_resolvesToOwnerStraightAway() public {
        _registerDirect("alice", alice, ONE_YEAR);
        assertEq(_resolveEthAddr(hub.core, "alice.hex"), alice, "addr(node)");
        assertEq(_resolveAddr(hub.core, "alice.hex", COIN_TYPE_ETH), alice, "Ethereum");
        assertEq(_resolveAddr(hub.core, "alice.hex", COIN_TYPE_PULSECHAIN), alice, "PulseChain");
        assertEq(_resolveAddr(hub.core, "alice.hex", COIN_TYPE_DEFAULT), alice, "default EVM");
        assertEq(_resolveAddr(hub.core, "alice.hex", COIN_TYPE_BTC), address(0), "not an EVM chain");
    }

    function test_lookup_unregisteredName_resolvesToNothing() public view {
        assertEq(_resolveEthAddr(hub.core, "nobody.hex"), address(0));
        assertEq(_resolveEthAddr(mirror.core, "nobody.hex"), address(0));
    }

    function test_lookup_expiredName_resolvesToNothing() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        vm.warp(block.timestamp + ONE_YEAR + 1);
        assertEq(_resolveEthAddr(hub.core, "alice.hex"), address(0), "PulseChain");
        assertEq(_resolveEthAddr(mirror.core, "alice.hex"), address(0), "Ethereum");
    }

    function test_mirror_renewalInGraceKeepsEthereumSettings() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        uint256 ethTokenId = mirror.core.hexRegistry.findTokenId("alice");
        vm.startPrank(alice);
        mirror.core.hexRegistry.setResolver(ethTokenId, address(0xBEEF));
        hub.core.hexRegistry.setResolver(tokenId, address(0xCAFE));
        vm.stopPrank();

        // It lapses for an hour, and alice renews it in its grace period.
        vm.warp(block.timestamp + ONE_YEAR + 1 hours);
        uint256 price = hub.registrar.getRenewPrice("alice", 5 * ONE_YEAR, plsUsdc);
        plsUsdc.mint(alice, price);
        vm.startPrank(alice);
        plsUsdc.approve(address(hub.registrar), price);
        hub.registrar.renew("alice", 5 * ONE_YEAR, plsUsdc, bytes32(0));
        vm.stopPrank();
        _syncAndRelay("alice");

        assertEq(hub.core.hexRegistry.getResolver("alice"), address(0xCAFE));
        assertEq(mirror.core.hexRegistry.findOwner("alice"), alice);
        assertEq(mirror.core.hexRegistry.getResolver("alice"), address(0xBEEF), "her Ethereum settings stay");
        assertEq(mirror.core.hexRegistry.findTokenId("alice"), ethTokenId, "the same name, extended");
        assertEq(mirror.core.hexRegistry.findExpiry("alice"), hub.core.hexRegistry.findExpiry("alice"));
    }

    function test_mirror_newOwnerAfterLapseStartsAfresh() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        uint256 ethTokenId = mirror.core.hexRegistry.findTokenId("alice");
        vm.prank(alice);
        mirror.core.hexRegistry.setResolver(ethTokenId, address(0xBEEF));

        // It lapses for good, and bob buys it: his copy has none of alice's settings.
        vm.warp(block.timestamp + ONE_YEAR + 60 days);
        _registerDirect("alice", bob, ONE_YEAR);
        _syncAndRelay("alice");
        assertEq(mirror.core.hexRegistry.findOwner("alice"), bob);
        assertEq(mirror.core.hexRegistry.getResolver("alice"), address(0));
    }

    function test_lookup_ownersOwnResolverWins() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        address wallet = makeAddr("alice's other wallet");
        vm.startPrank(alice);
        PermissionedResolver resolver = PermissionedResolver(
            hub.core.verifiableFactory
                .deployProxy(
                    address(hub.core.resolverImplementation),
                    1,
                    abi.encodeCall(PermissionedResolver.initialize, (alice, EACBaseRolesLib.ALL_ROLES, new bytes[](0)))
                )
        );
        resolver.setAddr(_node("alice.hex"), COIN_TYPE_ETH, abi.encodePacked(wallet));
        resolver.setText(_node("alice.hex"), "com.twitter", "alice");
        hub.core.hexRegistry.setResolver(tokenId, address(resolver));
        vm.stopPrank();
        assertEq(_resolveEthAddr(hub.core, "alice.hex"), wallet);
    }

    // ------------------------------------------------------------------------------------------
    // The Ethereum copy
    // ------------------------------------------------------------------------------------------

    function test_copy_appearsOnEthereumAfterRelay() public {
        _registerDirect("alice", alice, ONE_YEAR);
        assertEq(mirror.core.hexRegistry.findOwner("alice"), address(0), "nothing before the message arrives");

        _syncAndRelay("alice");

        assertEq(mirror.core.hexRegistry.findOwner("alice"), alice);
        assertEq(mirror.core.hexRegistry.findExpiry("alice"), hub.core.hexRegistry.findExpiry("alice"));
        assertEq(_resolveEthAddr(mirror.core, "alice.hex"), alice, "resolves on Ethereum");
        assertEq(_resolveAddr(mirror.core, "alice.hex", COIN_TYPE_PULSECHAIN), alice);
    }

    function test_copy_cannotBeTransferredOnEthereum() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        uint256 tokenId = mirror.core.hexRegistry.findTokenId("alice");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("TransferDisallowed(uint256,address)", tokenId, alice));
        mirror.core.hexRegistry.safeTransferFrom(alice, bob, tokenId, 1, "");
    }

    function test_copy_ownerCanSetResolverOnEthereum() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        uint256 tokenId = mirror.core.hexRegistry.findTokenId("alice");
        vm.prank(alice);
        mirror.core.hexRegistry.setResolver(tokenId, address(0xBEEF));
        assertEq(mirror.core.hexRegistry.getResolver("alice"), address(0xBEEF));
    }

    function test_copy_followsATransfer_andForgetsOldSettings() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        uint256 ethTokenId = mirror.core.hexRegistry.findTokenId("alice");
        vm.prank(alice);
        mirror.core.hexRegistry.setResolver(ethTokenId, address(0xBEEF));

        vm.prank(alice);
        hub.core.hexRegistry.safeTransferFrom(alice, bob, tokenId, 1, "");
        _syncAndRelay("alice");

        assertEq(mirror.core.hexRegistry.findOwner("alice"), bob);
        assertEq(mirror.core.hexRegistry.getResolver("alice"), address(0), "alice's Ethereum resolver is gone");
        assertEq(_resolveEthAddr(mirror.core, "alice.hex"), bob);
    }

    function test_copy_followsARenewal() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        uint64 before = mirror.core.hexRegistry.findExpiry("alice");

        uint256 price = hub.registrar.getRenewPrice("alice", ONE_YEAR, plsUsdc);
        plsUsdc.mint(bob, price);
        vm.startPrank(bob);
        plsUsdc.approve(address(hub.registrar), price);
        hub.registrar.renew("alice", ONE_YEAR, plsUsdc, bytes32(0));
        vm.stopPrank();
        _syncAndRelay("alice");

        assertEq(mirror.core.hexRegistry.findExpiry("alice"), before + ONE_YEAR);
        assertEq(mirror.core.hexRegistry.findOwner("alice"), alice);
    }

    function test_copy_renewalInGraceRevivesIt() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        vm.warp(block.timestamp + ONE_YEAR + 1 days); // expired, still in the grace period
        assertEq(mirror.core.hexRegistry.findOwner("alice"), address(0));

        uint256 price = hub.registrar.getRenewPrice("alice", ONE_YEAR, plsUsdc);
        plsUsdc.mint(alice, price);
        vm.startPrank(alice);
        plsUsdc.approve(address(hub.registrar), price);
        hub.registrar.renew("alice", ONE_YEAR, plsUsdc, bytes32(0));
        vm.stopPrank();
        _syncAndRelay("alice");

        assertEq(mirror.core.hexRegistry.findOwner("alice"), alice);
        assertEq(mirror.core.hexRegistry.findExpiry("alice"), hub.core.hexRegistry.findExpiry("alice"));
    }

    function test_copy_expiresWithPulseChain() public {
        _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        vm.warp(block.timestamp + ONE_YEAR + GRACE_PERIOD + 1);
        _syncAndRelay("alice");
        assertEq(mirror.core.hexRegistry.findOwner("alice"), address(0));
        assertEq(
            uint8(mirror.core.hexRegistry.getStatus(_labelId("alice"))), uint8(IPermissionedRegistry.Status.AVAILABLE)
        );
    }

    function test_copy_messagesOutOfOrder_olderOneIgnored() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        hub.mirrorSync.sync("alice"); // message 0: alice
        vm.prank(alice);
        hub.core.hexRegistry.safeTransferFrom(alice, bob, tokenId, 1, "");
        hub.mirrorSync.sync("alice"); // message 1: bob

        foreignAmb.deliver(homeAmb, 1);
        vm.expectEmit(address(mirror.mirrorRegistrar));
        emit HexMirrorRegistrar.MirrorStale("alice", 1, 2);
        foreignAmb.deliver(homeAmb, 0);

        assertEq(mirror.core.hexRegistry.findOwner("alice"), bob);
    }

    function test_copy_ownerThatCannotHoldItOnEthereum_leavesNoEntry() public {
        PickyReceiver wallet = new PickyReceiver(address(hub.core.hexRegistry));
        _registerDirect("picky", address(wallet), ONE_YEAR);
        hub.mirrorSync.sync("picky");
        (bool ok,) = foreignAmb.deliver(homeAmb, 0);
        assertTrue(ok, "the bridge message itself does not fail");
        assertEq(mirror.core.hexRegistry.findOwner("picky"), address(0));
    }

    function test_copy_messageHasEnoughGas() public {
        // The costliest case: replacing an owner (unregister, then register). Check it fits the gas
        // each message asks for, with room to spare.
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        _syncAndRelay("alice");
        vm.prank(alice);
        hub.core.hexRegistry.safeTransferFrom(alice, bob, tokenId, 1, "");
        hub.mirrorSync.sync("alice");
        (bool ok,) = foreignAmb.deliver(homeAmb, homeAmb.outboxLength() - 1);
        assertTrue(ok);
        assertLt(foreignAmb.lastGasUsed(), MIRROR_GAS / 2, "uses under half the gas it asks for");
        assertEq(mirror.core.hexRegistry.findOwner("alice"), bob);
    }

    // ------------------------------------------------------------------------------------------
    // Only PulseChain can write the copy
    // ------------------------------------------------------------------------------------------

    function test_auth_directCallRejected() public {
        vm.expectRevert(BridgeLink.NotFromPeer.selector);
        mirror.mirrorRegistrar.mirror("alice", bob, uint64(block.timestamp + 1 days), 1);
    }

    function test_auth_wrongSenderRejected() public {
        (bool ok,) = foreignAmb.deliverForged(
            address(mirror.mirrorRegistrar),
            abi.encodeCall(IHexMirrorReceiver.mirror, ("alice", bob, uint64(block.timestamp + 1 days), 1)),
            bob,
            PULSECHAIN_CHAIN_ID
        );
        assertFalse(ok);
        assertEq(mirror.core.hexRegistry.findOwner("alice"), address(0));
    }

    function test_auth_wrongChainRejected() public {
        (bool ok,) = foreignAmb.deliverForged(
            address(mirror.mirrorRegistrar),
            abi.encodeCall(IHexMirrorReceiver.mirror, ("alice", bob, uint64(block.timestamp + 1 days), 1)),
            address(hub.mirrorSync),
            56
        );
        assertFalse(ok);
    }

    function test_auth_wrongBridgeRejected() public {
        vm.prank(address(homeAmb)); // PulseChain's bridge contract has no business calling on Ethereum
        vm.expectRevert(BridgeLink.NotFromPeer.selector);
        mirror.mirrorRegistrar.mirror("alice", bob, uint64(block.timestamp + 1 days), 1);
    }

    function test_sync_rejectsBadLabels() public {
        vm.expectRevert(HexMirrorSync.InvalidLabel.selector);
        hub.mirrorSync.sync("");
    }

    function test_sync_unregisteredNameSendsNoOwner() public {
        vm.expectEmit(address(hub.mirrorSync));
        emit HexMirrorSync.Synced("ghost", address(0), 0, 1, bytes32(0));
        hub.mirrorSync.sync("ghost");
        _relayToEthereum();
        assertEq(mirror.core.hexRegistry.findOwner("ghost"), address(0));
    }

    function test_ownerResolver_rejectsOtherRecords() public {
        _registerDirect("alice", alice, ONE_YEAR);
        bytes memory textCall = abi.encodeWithSignature("text(bytes32,string)", _node("alice.hex"), "avatar");
        vm.expectRevert(abi.encodeWithSelector(OwnerResolver.UnsupportedResolverProfile.selector, bytes4(textCall)));
        hub.core.ownerResolver.resolve(_dns("alice.hex"), textCall);
    }
}
