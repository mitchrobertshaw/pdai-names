// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IEnhancedAccessControl} from "@ensv2/access-control/interfaces/IEnhancedAccessControl.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {IRegistryURIRenderer} from "@ensv2/registry/interfaces/IRegistryURIRenderer.sol";
import {RegistryRolesLib} from "@ensv2/registry/libraries/RegistryRolesLib.sol";

import {PdaiTestBase} from "../helpers/PdaiTestBase.sol";

/// @notice Name cards: what wallets and NFT marketplaces show for each .pdai name, as ENS's metadata
///         service does for .eth names.
contract NameCardTest is PdaiTestBase {
    uint256 internal constant NOT_FOUND = type(uint256).max;

    function _json(uint256 tokenId) internal view returns (string memory) {
        return deployed.nameCard.json(IRegistry(address(deployed.pdaiRegistry)), tokenId);
    }

    /// @dev A name as the registry would hold it, whatever its characters: the registrar's role.
    function _put(string memory label, uint64 expiry) internal returns (uint256 tokenId) {
        vm.prank(address(deployed.registrar));
        tokenId = deployed.pdaiRegistry.register(label, alice, IRegistry(address(0)), address(0), 0, expiry);
    }

    function _has(string memory haystack, string memory needle) internal pure returns (bool) {
        return vm.indexOf(haystack, needle) != NOT_FOUND;
    }

    function test_nameCard_isWhatWalletsAndMarketplacesSee() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        string memory json = _json(tokenId);
        // The registry's token URI is the card's details, set up at deploy.
        assertEq(
            deployed.pdaiRegistry.uri(tokenId),
            string.concat("data:application/json;base64,", Base64.encode(bytes(json)))
        );
        assertEq(vm.parseJsonString(json, ".name"), "alice.pdai");
        assertEq(vm.parseJsonString(json, ".external_url"), "https://pdai-domains-testnet.netlify.app/app/alice.pdai");
        assertTrue(_has(vm.parseJsonString(json, ".description"), "one name for a wallet, on PulseChain"));
        assertEq(vm.parseJsonUint(json, ".attributes[0].value"), 5, "length");
        assertEq(vm.parseJsonUint(json, ".attributes[1].value"), deployed.pdaiRegistry.getExpiry(tokenId), "expiry");
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "Active");
        string memory image = vm.parseJsonString(json, ".image");
        string memory svg = deployed.nameCard.svg("alice", false);
        assertEq(image, string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg))));
        assertTrue(_has(svg, ">alice.pdai</text>"));
        assertTrue(_has(svg, ">pDAI Name Service</text>"));
        assertTrue(_has(svg, 'fill="url(#g)"'), "on pDAI Name Service's navy");
        assertTrue(_has(svg, 'fill="url(#p)"'), "the mark in pDAI's colours");
        assertTrue(_has(svg, 'fill="#FFFFFF"'), "in white, easy to read on the navy");
        assertFalse(_has(svg, "#4A4759"), "not the expired grey");
    }

    function test_nameCard_escapesWhateverTheLabelHolds() public {
        // The registry takes any label, so a card must never let one break its JSON, SVG or link.
        string memory label = string.concat("a\"<b>&\\c'", string(hex"01"));
        uint256 tokenId = _put(label, uint64(block.timestamp + ONE_YEAR));
        string memory json = _json(tokenId);
        assertEq(vm.parseJsonString(json, ".name"), string.concat(label, ".pdai"), "valid JSON, the name intact");
        assertEq(
            vm.parseJsonString(json, ".external_url"),
            "https://pdai-domains-testnet.netlify.app/app/a%22%3Cb%3E%26%5Cc%27%01.pdai"
        );
        assertTrue(_has(deployed.nameCard.svg(label, false), ">a&quot;&lt;b&gt;&amp;\\c&#39;?.pdai</text>"));
    }

    function test_nameCard_countsCharactersAsThePricesDo() public {
        string memory label = unicode"🦄🦄🦄";
        uint256 tokenId = _put(label, uint64(block.timestamp + ONE_YEAR));
        string memory json = _json(tokenId);
        assertEq(vm.parseJsonString(json, ".name"), unicode"🦄🦄🦄.pdai");
        assertEq(vm.parseJsonUint(json, ".attributes[0].value"), 3);
        assertEq(
            vm.parseJsonString(json, ".external_url"),
            "https://pdai-domains-testnet.netlify.app/app/%F0%9F%A6%84%F0%9F%A6%84%F0%9F%A6%84.pdai"
        );
        assertTrue(_has(deployed.nameCard.svg(label, false), unicode">🦄🦄🦄.pdai</text>"));
    }

    function test_nameCard_shortensLongNamesOnTheCardOnly() public {
        string memory label = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijk"; // 63
        uint256 tokenId = _put(label, uint64(block.timestamp + ONE_YEAR));
        assertEq(vm.parseJsonString(_json(tokenId), ".name"), string.concat(label, ".pdai"));
        string memory svg = deployed.nameCard.svg(label, false);
        assertTrue(_has(svg, unicode">abcdefghijklmnopqrstuv…</text>"), "what fits, with an ellipsis");
        assertTrue(_has(svg, 'font-size="14"'), "at the smallest size");
        assertFalse(_has(svg, label));
        // Wide letters fit fewer; narrow ones more.
        assertTrue(
            _has(deployed.nameCard.svg("mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm", false), unicode">mmmmmmmmmmmmm…</text>")
        );
        assertTrue(
            _has(
                deployed.nameCard.svg("iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii", false),
                unicode">iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii…</text>"
            )
        );
        // A multi-byte name is cut between characters, never inside one.
        string memory emoji =
            unicode"🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄";
        assertTrue(
            _has(deployed.nameCard.svg(emoji, false), unicode">🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄…</text>")
        );
    }

    function test_nameCard_showsEachNameAsLargeAsFits() public view {
        assertTrue(_has(deployed.nameCard.svg("alice", false), 'font-size="36"'), "short names at the largest size");
        assertTrue(_has(deployed.nameCard.svg("richardheart", false), 'font-size="22"'));
        assertTrue(_has(deployed.nameCard.svg("richardheart", false), ">richardheart.pdai</text>"), "whole");
        // Emoji joined into one (a family) count as the emoji they're made of, not their joiners.
        assertTrue(_has(deployed.nameCard.svg(unicode"👨‍👩‍👧", false), 'font-size="33"'));
    }

    function test_nameCard_neverCutsInsideAnEmojiOrTheEnding() public view {
        // Flags are two letters each: cut between flags, not between a flag's letters.
        assertTrue(
            _has(
                deployed.nameCard.svg(unicode"🇺🇸🇬🇧🇫🇷🇩🇪🇯🇵🇨🇦🇧🇷", false),
                unicode">🇺🇸🇬🇧🇫🇷🇩🇪🇯🇵…</text>"
            )
        );
        // A skin tone stays with its emoji.
        assertTrue(
            _has(
                deployed.nameCard.svg(unicode"👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽", false),
                unicode">👍🏽👍🏽👍🏽👍🏽👍🏽…</text>"
            )
        );
        // A name that just doesn't fit with its ending loses the whole ending, not part of it.
        assertTrue(_has(deployed.nameCard.svg("mmmmmmmmmmmmm", false), unicode">mmmmmmmmmmmmm…</text>"));
    }

    /// @dev Any label at all makes a card: none can make the renderer fail, which would leave the
    ///      name blank in wallets and marketplaces.
    function testFuzz_nameCard_anyLabelMakesACard(bytes memory label, bool expired) public view {
        string memory card = deployed.nameCard.svg(string(label), expired);
        assertTrue(_has(card, "</text></svg>"));
        deployed.nameCard.description(string(label), expired);
    }

    function test_nameCard_saysWhenANameHasExpired() public {
        uint256 tokenId = _registerDirect("alice", alice, ONE_YEAR);
        vm.warp(block.timestamp + ONE_YEAR + 1 days);
        string memory json = _json(tokenId);
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "Expired");
        assertTrue(_has(vm.parseJsonString(json, ".description"), "has expired"));
        string memory svg = deployed.nameCard.svg("alice", true);
        assertTrue(_has(svg, ">EXPIRED</text>"));
        assertTrue(_has(svg, 'fill="#4A4759"'), "grey instead of the navy");
        assertTrue(_has(svg, 'fill="#FFFFFF"'), "in white, easy to read on the grey");
        assertFalse(_has(svg, "url(#p)"), "the mark in grey, not pDAI's colours");
    }

    function test_nameCard_isSafeForAnIdNobodyHolds() public view {
        assertTrue(_has(deployed.pdaiRegistry.uri(123), "data:application/json;base64,"));
        assertEq(vm.parseJsonString(_json(123), ".name"), "a .pdai name");
    }

    function test_nameCard_linksToTheAppOnMainnetAndTheTestnetSiteOtherwise() public pure {
        assertEq(_appUrl(369), "https://app.pdai.domains/", "PulseChain");
        assertEq(_appUrl(943), "https://pdai-domains-testnet.netlify.app/app/", "PulseChain's testnet");
    }

    function test_nameCard_onlyTheAdminCanRestyleThem() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEnhancedAccessControl.EACUnauthorizedAccountRoles.selector, 0, RegistryRolesLib.ROLE_SET_URI, stranger
            )
        );
        deployed.pdaiRegistry.setURI("ipfs://elsewhere", IRegistryURIRenderer(address(0)));

        // Cosmetic: a new design changes no name. The admin can do it, and give it up.
        vm.startPrank(admin);
        deployed.pdaiRegistry.setURI("ipfs://new-design", IRegistryURIRenderer(address(0)));
        assertEq(deployed.pdaiRegistry.uri(1), "ipfs://new-design");
        deployed.pdaiRegistry.revokeRootRoles(RegistryRolesLib.ROLE_SET_URI | RegistryRolesLib.ROLE_SET_URI_ADMIN, admin);
        vm.expectRevert();
        deployed.pdaiRegistry.setURI("", IRegistryURIRenderer(address(0)));
        vm.stopPrank();

        // Nor can the deployer, which gave everything up.
        vm.expectRevert();
        deployed.pdaiRegistry.setURI("ipfs://elsewhere", IRegistryURIRenderer(address(0)));
    }
}
