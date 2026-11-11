// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IEnhancedAccessControl} from "@ensv2/access-control/interfaces/IEnhancedAccessControl.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {IRegistryURIRenderer} from "@ensv2/registry/interfaces/IRegistryURIRenderer.sol";
import {RegistryRolesLib} from "@ensv2/registry/libraries/RegistryRolesLib.sol";

import {HexTestBase} from "../helpers/HexTestBase.sol";

/// @notice Name cards: what wallets and NFT marketplaces show for each .hex name, as ENS's metadata
///         service does for .eth names.
contract NameCardTest is HexTestBase {
    uint256 internal constant NOT_FOUND = type(uint256).max;

    function _json(uint256 tokenId) internal view returns (string memory) {
        return hub.core.nameCard.json(IRegistry(address(hub.core.hexRegistry)), tokenId);
    }

    /// @dev A name as the registry would hold it, whatever its characters: the registrar's role.
    function _put(string memory label, uint64 expiry) internal returns (uint256 tokenId) {
        vm.prank(address(hub.registrar));
        tokenId = hub.core.hexRegistry.register(label, alice, IRegistry(address(0)), address(0), 0, expiry);
    }

    function _has(string memory haystack, string memory needle) internal pure returns (bool) {
        return vm.indexOf(haystack, needle) != NOT_FOUND;
    }

    function test_nameCard_isWhatWalletsAndMarketplacesSee() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        string memory json = _json(tokenId);
        // The registry's token URI is the card's details, set up at deploy.
        assertEq(
            hub.core.hexRegistry.uri(tokenId),
            string.concat("data:application/json;base64,", Base64.encode(bytes(json)))
        );
        assertEq(vm.parseJsonString(json, ".name"), "alice.hex");
        assertEq(vm.parseJsonString(json, ".external_url"), "https://hexns-testnet.netlify.app/app/alice.hex");
        assertTrue(_has(vm.parseJsonString(json, ".description"), "one name for a wallet, on PulseChain and Ethereum"));
        assertEq(vm.parseJsonUint(json, ".attributes[0].value"), 5, "length");
        assertEq(vm.parseJsonUint(json, ".attributes[1].value"), hub.core.hexRegistry.getExpiry(tokenId), "expiry");
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "Active");
        string memory image = vm.parseJsonString(json, ".image");
        string memory svg = hub.core.nameCard.svg("alice", false);
        assertEq(image, string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg))));
        assertTrue(_has(svg, ">alice.hex</text>"));
        assertTrue(_has(svg, ">HexNS</text>"));
        assertTrue(_has(svg, "url(#g)"), "the HexNS gradient");
    }

    function test_nameCard_escapesWhateverTheLabelHolds() public {
        // The registry takes any label, so a card must never let one break its JSON, SVG or link.
        string memory label = string.concat("a\"<b>&\\c'", string(hex"01"));
        uint256 tokenId = _put(label, uint64(block.timestamp + ONE_YEAR));
        string memory json = _json(tokenId);
        assertEq(vm.parseJsonString(json, ".name"), string.concat(label, ".hex"), "valid JSON, the name intact");
        assertEq(
            vm.parseJsonString(json, ".external_url"),
            "https://hexns-testnet.netlify.app/app/a%22%3Cb%3E%26%5Cc%27%01.hex"
        );
        assertTrue(_has(hub.core.nameCard.svg(label, false), ">a&quot;&lt;b&gt;&amp;\\c&#39;?.hex</text>"));
    }

    function test_nameCard_countsCharactersAsThePricesDo() public {
        string memory label = unicode"🦄🦄🦄";
        uint256 tokenId = _put(label, uint64(block.timestamp + ONE_YEAR));
        string memory json = _json(tokenId);
        assertEq(vm.parseJsonString(json, ".name"), unicode"🦄🦄🦄.hex");
        assertEq(vm.parseJsonUint(json, ".attributes[0].value"), 3);
        assertEq(
            vm.parseJsonString(json, ".external_url"),
            "https://hexns-testnet.netlify.app/app/%F0%9F%A6%84%F0%9F%A6%84%F0%9F%A6%84.hex"
        );
        assertTrue(_has(hub.core.nameCard.svg(label, false), unicode">🦄🦄🦄.hex</text>"));
    }

    function test_nameCard_shortensLongNamesOnTheCardOnly() public {
        string memory label = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijk"; // 63
        uint256 tokenId = _put(label, uint64(block.timestamp + ONE_YEAR));
        assertEq(vm.parseJsonString(_json(tokenId), ".name"), string.concat(label, ".hex"));
        string memory svg = hub.core.nameCard.svg(label, false);
        assertTrue(_has(svg, unicode">abcdefghijklmnopqrstuv…</text>"), "what fits, with an ellipsis");
        assertTrue(_has(svg, 'font-size="14"'), "at the smallest size");
        assertFalse(_has(svg, label));
        // Wide letters fit fewer; narrow ones more.
        assertTrue(
            _has(hub.core.nameCard.svg("mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm", false), unicode">mmmmmmmmmmmmm…</text>")
        );
        assertTrue(
            _has(
                hub.core.nameCard.svg("iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii", false),
                unicode">iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii…</text>"
            )
        );
        // A multi-byte name is cut between characters, never inside one.
        string memory emoji =
            unicode"🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄";
        assertTrue(
            _has(hub.core.nameCard.svg(emoji, false), unicode">🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄…</text>")
        );
    }

    function test_nameCard_showsEachNameAsLargeAsFits() public view {
        assertTrue(_has(hub.core.nameCard.svg("alice", false), 'font-size="36"'), "short names at the largest size");
        assertTrue(_has(hub.core.nameCard.svg("richardheart", false), 'font-size="23"'));
        assertTrue(_has(hub.core.nameCard.svg("richardheart", false), ">richardheart.hex</text>"), "whole");
        // Emoji joined into one (a family) count as the emoji they're made of, not their joiners.
        assertTrue(_has(hub.core.nameCard.svg(unicode"👨‍👩‍👧", false), 'font-size="35"'));
    }

    function test_nameCard_neverCutsInsideAnEmojiOrTheEnding() public view {
        // Flags are two letters each: cut between flags, not between a flag's letters.
        assertTrue(
            _has(
                hub.core.nameCard.svg(unicode"🇺🇸🇬🇧🇫🇷🇩🇪🇯🇵🇨🇦🇧🇷", false),
                unicode">🇺🇸🇬🇧🇫🇷🇩🇪🇯🇵…</text>"
            )
        );
        // A skin tone stays with its emoji.
        assertTrue(
            _has(
                hub.core.nameCard.svg(unicode"👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽", false),
                unicode">👍🏽👍🏽👍🏽👍🏽👍🏽…</text>"
            )
        );
        // A name that just doesn't fit with its ending loses the whole ending, not part of it.
        assertTrue(_has(hub.core.nameCard.svg("mmmmmmmmmmmmm", false), unicode">mmmmmmmmmmmmm…</text>"));
    }

    /// @dev Any label at all makes a card: none can make the renderer fail, which would leave the
    ///      name blank in wallets and marketplaces.
    function testFuzz_nameCard_anyLabelMakesACard(bytes memory label, bool expired) public view {
        string memory card = hub.core.nameCard.svg(string(label), expired);
        assertTrue(_has(card, "</text></svg>"));
        hub.core.nameCard.description(string(label), expired);
        mirror.core.nameCard.svg(string(label), expired);
    }

    function test_nameCard_saysWhenANameHasExpired() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        vm.warp(block.timestamp + ONE_YEAR + 1 days);
        string memory json = _json(tokenId);
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "Expired");
        assertTrue(_has(vm.parseJsonString(json, ".description"), "has expired"));
        string memory svg = hub.core.nameCard.svg("alice", true);
        assertTrue(_has(svg, ">EXPIRED</text>"));
        assertTrue(_has(svg, "#6E6A78"), "grey instead of the gradient");
    }

    function test_nameCard_ethereumCopySaysWhereTheNameLives() public view {
        assertFalse(hub.core.nameCard.ETHEREUM_COPY());
        assertTrue(mirror.core.nameCard.ETHEREUM_COPY());
        assertTrue(_has(mirror.core.nameCard.description("alice.hex", false), "can't be sold or moved on Ethereum"));
        assertTrue(_has(mirror.core.nameCard.svg("alice", false), ">Ethereum copy</text>"));
        // Wired up on both registries, and safe for an id nobody holds.
        assertTrue(_has(mirror.core.hexRegistry.uri(123), "data:application/json;base64,"));
        assertTrue(_has(hub.core.hexRegistry.uri(123), "data:application/json;base64,"));
        assertEq(vm.parseJsonString(_json(123), ".name"), "a .hex name");
    }

    function test_nameCard_linksToTheAppOnMainnetAndTheTestnetSiteOtherwise() public pure {
        assertEq(_appUrl(369), "https://app.hexns.domains/", "PulseChain");
        assertEq(_appUrl(1), "https://app.hexns.domains/", "Ethereum");
        assertEq(_appUrl(943), "https://hexns-testnet.netlify.app/app/", "PulseChain's testnet");
        assertEq(_appUrl(11155111), "https://hexns-testnet.netlify.app/app/", "Sepolia");
    }

    function test_nameCard_onlyTheAdminCanRestyleThemOnPulseChain() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, 0, RegistryRolesLib.ROLE_SET_URI, stranger
            )
        );
        hub.core.hexRegistry.setURI("ipfs://elsewhere", IRegistryURIRenderer(address(0)));

        // Cosmetic: a new design changes no name. The admin can do it, and give it up.
        vm.startPrank(admin);
        hub.core.hexRegistry.setURI("ipfs://new-design", IRegistryURIRenderer(address(0)));
        assertEq(hub.core.hexRegistry.uri(1), "ipfs://new-design");
        hub.core.hexRegistry.revokeRootRoles(RegistryRolesLib.ROLE_SET_URI | RegistryRolesLib.ROLE_SET_URI_ADMIN, admin);
        vm.expectRevert();
        hub.core.hexRegistry.setURI("", IRegistryURIRenderer(address(0)));
        vm.stopPrank();

        // On Ethereum nobody can: the copy has no admin, and the deployer gave everything up.
        address[2] memory tried = [admin, address(this)];
        for (uint256 i = 0; i < tried.length; ++i) {
            vm.prank(tried[i]);
            vm.expectRevert();
            mirror.core.hexRegistry.setURI("ipfs://elsewhere", IRegistryURIRenderer(address(0)));
        }
    }
}
