// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IRegistry} from "@ensv2/registry/interfaces/IRegistry.sol";
import {IRegistryURIRenderer} from "@ensv2/registry/interfaces/IRegistryURIRenderer.sol";
import {IStandardRegistry} from "@ensv2/registry/interfaces/IStandardRegistry.sol";
import {ILabelStore} from "@ensv2/utils/interfaces/ILabelStore.sol";

/// @dev The registry's label store, which ENSv2's PermissionedRegistry exposes.
interface IHasLabelStore {
    function LABEL_STORE() external view returns (ILabelStore);
}

/// @title HexNameCard
/// @notice What wallets and NFT marketplaces show for a .hex name, as ENS's metadata service does
///         for .eth names: a card with the name on the HexNS gradient, its length, when it's paid
///         until and whether it has expired, and a link to its page in the app. Made on-chain, so
///         nothing has to stay online for names to show properly.
/// @dev The .hex registry's URI renderer (PermissionedRegistry.setURI). Labels are whatever was
///      registered, so every one is escaped for the JSON, the SVG and the link it goes into.
contract HexNameCard is IRegistryURIRenderer {
    using Strings for uint256;

    /// @dev The HexNS mark ("Route"), as in web/src/components/Logo.tsx.
    string internal constant ROUTE_PATH =
        "M33.45 5.989L53.802 17.739A2.9 2.9 0 0 1 50.902 22.761L30.55 11.011A2.9 2.9 0 0 1 33.45 5.989ZM55.252 20.25L55.252 43.75A2.9 2.9 0 0 1 49.452 43.75L49.452 20.25A2.9 2.9 0 0 1 55.252 20.25ZM53.802 46.261L33.45 58.011A2.9 2.9 0 0 1 30.55 52.989L50.902 41.239A2.9 2.9 0 0 1 53.802 46.261ZM30.55 58.011L10.198 46.261A2.9 2.9 0 0 1 13.098 41.239L33.45 52.989A2.9 2.9 0 0 1 30.55 58.011ZM8.748 43.75L8.748 20.25A2.9 2.9 0 0 1 14.548 20.25L14.548 43.75A2.9 2.9 0 0 1 8.748 43.75ZM13.098 17.739L33.45 29.489A2.9 2.9 0 0 1 30.55 34.511L10.198 22.761A2.9 2.9 0 0 1 13.098 17.739ZM24.6 32A7.4 7.4 0 1 1 39.4 32A7.4 7.4 0 1 1 24.6 32Z";

    /// @dev The card's lettering: the app's own font first, then ones most devices have.
    string internal constant FONT = "Space Grotesk,Inter,Helvetica,Arial,sans-serif";

    /// @dev The room for the name: the 222 pixels between the card's margins.
    uint256 internal constant ROOM = 222;

    /// @dev The name's font size in pixels: as large as fits, up to MAX_SIZE. A name too long even
    ///      at MIN_SIZE is shortened on the card, with an ellipsis; the details keep it whole.
    uint256 internal constant MAX_SIZE = 36;
    uint256 internal constant MIN_SIZE = 14;

    /// @dev How wide each character from " " to "~" is, in hundredths of the font size: the most it
    ///      is in the bold fonts a card is likely drawn with (Space Grotesk, Inter, Helvetica, Arial
    ///      and DejaVu Sans), so a name fits whichever of them a wallet has.
    bytes internal constant WIDTHS =
        hex"232e3854466658222e2e3854262f26274646464646464646464628285454543e664e4d4a5445455354263d4e406454564a564e4945524e6f4e4a492e272e543e3244483c48442c4848232343236948454848323c3048425d41423b48264854";

    /// @dev Any other character, at most: emoji are the widest, at 1.25 of the font size.
    uint256 internal constant WIDE = 125;

    /// @dev Kinds of character, for where a name can be cut. A mark draws with the character before
    ///      it: a skin tone, a variation selector, a keycap's frame, the tags of a flag like
    ///      England's. A joiner (the zero-width joiner) makes one emoji of those either side, and
    ///      two flag letters make a flag.
    uint8 internal constant PLAIN = 0;
    uint8 internal constant MARK = 1;
    uint8 internal constant JOINER = 2;
    uint8 internal constant FLAG_LETTER = 3;

    /// @notice The app's address for names, which "<label>.hex" is added to: each card links there.
    string public appUrl;

    /// @notice Whether these are the Ethereum copy's cards, which say where the name lives.
    bool public immutable ETHEREUM_COPY;

    constructor(string memory appUrl_, bool ethereumCopy) {
        appUrl = appUrl_;
        ETHEREUM_COPY = ethereumCopy;
    }

    /// @inheritdoc IRegistryURIRenderer
    function renderURI(IRegistry registry, uint256 tokenId) external view returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json(registry, tokenId))));
    }

    /// @notice The name's details as JSON (ERC-1155 metadata): name, description, card, link, traits.
    function json(IRegistry registry, uint256 tokenId) public view returns (string memory) {
        string memory label = IHasLabelStore(address(registry)).LABEL_STORE().getLabel(tokenId);
        uint64 expiry = IStandardRegistry(address(registry)).getExpiry(tokenId);
        bool expired = expiry <= block.timestamp;
        string memory name = bytes(label).length == 0 ? "a .hex name" : string.concat(label, ".hex");
        string memory head = string.concat(
            '{"name":"',
            _jsonEscape(name),
            '","description":"',
            _jsonEscape(description(name, expired)),
            '","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg(label, expired))),
            '","external_url":"',
            appUrl,
            _urlEncode(label),
            '.hex"'
        );
        return string.concat(head, ',"attributes":', _attributes(label, expiry, expired), "}");
    }

    /// @notice What the card says about the name, in a sentence or two.
    function description(string memory name, bool expired) public view returns (string memory) {
        if (ETHEREUM_COPY) {
            return string.concat(
                "The Ethereum copy of ",
                name,
                ", a name that lives on PulseChain. It follows the name there by itself, and can't be sold or moved on Ethereum: trade ",
                name,
                " on PulseChain."
            );
        }
        if (expired) {
            return string.concat(
                name,
                " has expired. Its owner can still renew it during its 28-day grace period; after that anyone can buy it."
            );
        }
        return string.concat(name, ": one name for a wallet, on PulseChain and Ethereum. hexns.domains");
    }

    /// @notice The card: the name on the HexNS gradient (grey once expired), with the HexNS mark.
    function svg(string memory label, bool expired) public view returns (string memory) {
        (string memory shown, uint256 size) = _fit(label);
        string memory top = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="270" height="270" viewBox="0 0 270 270">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0" stop-color="#FFB800"/><stop offset="0.38" stop-color="#FF6A1F"/>',
            '<stop offset="0.68" stop-color="#FF3D5A"/><stop offset="1" stop-color="#E5007A"/></linearGradient></defs>',
            expired
                ? '<rect width="270" height="270" fill="#6E6A78"/>'
                : '<rect width="270" height="270" fill="url(#g)"/>',
            '<path transform="translate(24 22) scale(0.72) translate(-8.748 -5.6)" fill="#FFFFFF" d="',
            ROUTE_PATH,
            '"/>'
        );
        string memory tag = string.concat(
            '<text x="246" y="44" text-anchor="end" font-family="',
            FONT,
            '" font-size="12" font-weight="700" fill="#FFFFFF" fill-opacity="0.9">',
            ETHEREUM_COPY ? "Ethereum copy" : "HexNS",
            "</text>",
            expired
                ? string.concat(
                    '<text x="246" y="64" text-anchor="end" font-family="',
                    FONT,
                    '" font-size="11" font-weight="700" fill="#FFFFFF">EXPIRED</text>'
                )
                : ""
        );
        string memory nameText = string.concat(
            '<text x="24" y="240" font-family="',
            FONT,
            '" font-size="',
            size.toString(),
            '" font-weight="700" fill="#FFFFFF">',
            _xmlEscape(shown),
            "</text></svg>"
        );
        return string.concat(top, tag, nameText);
    }

    function _attributes(string memory label, uint64 expiry, bool expired) internal pure returns (string memory) {
        return string.concat(
            '[{"trait_type":"Length","display_type":"number","value":',
            _length(label).toString(),
            '},{"trait_type":"Expiry date","display_type":"date","value":',
            uint256(expiry).toString(),
            '},{"trait_type":"Status","value":"',
            expired ? "Expired" : "Active",
            '"}]'
        );
    }

    /// @dev Characters (Unicode code points) in UTF-8 `s`, as the registrar counts them for prices.
    function _length(string memory s) internal pure returns (uint256 n) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; ++i) {
            if (uint8(b[i]) & 0xC0 != 0x80) ++n;
        }
    }

    /// @dev "<label>.hex" as the card shows it, and its font size: as large as fits in ROOM, up to
    ///      MAX_SIZE. A name that doesn't fit even at MIN_SIZE is cut within the label, with an
    ///      ellipsis, and never inside an emoji: not before a skin tone, a joined emoji or a
    ///      flag's second letter.
    function _fit(string memory label) internal pure returns (string memory shown, uint256 size) {
        bytes memory b = bytes(string.concat(label, ".hex"));
        uint256 most = (ROOM * 100) / MIN_SIZE; // the widest that fits, in hundredths of the font size
        uint256 width = 0;
        uint256 cut = 0; // the last place a cut can go, leaving room for the ellipsis
        uint256 cutWidth = 0;
        bool afterJoiner = false;
        bool afterFirstFlagLetter = false;
        for (uint256 i = 0; i < b.length; ++i) {
            if ((uint8(b[i]) & 0xC0) == 0x80) continue; // the rest of a character's bytes (UTF-8)
            (uint256 w, uint8 kind) = _char(b, i);
            bool attached =
                kind == MARK || kind == JOINER || afterJoiner || (kind == FLAG_LETTER && afterFirstFlagLetter);
            if (!attached && i <= bytes(label).length && width + WIDE <= most) {
                cut = i;
                cutWidth = width;
            }
            width += w;
            afterJoiner = kind == JOINER;
            afterFirstFlagLetter = kind == FLAG_LETTER && !afterFirstFlagLetter;
        }
        shown = string(b);
        if (width > most) {
            bytes memory kept = new bytes(cut);
            for (uint256 i = 0; i < cut; ++i) {
                kept[i] = b[i];
            }
            shown = string.concat(string(kept), unicode"…");
            width = cutWidth + WIDE;
        }
        size = (ROOM * 100) / width;
        if (size > MAX_SIZE) size = MAX_SIZE;
        if (size < MIN_SIZE) size = MIN_SIZE;
    }

    /// @dev The character starting at `b[i]`: the most it can draw, in hundredths of the font size,
    ///      and its kind. Marks and joiners that draw nothing count 0; everything else counts at
    ///      least as wide as it draws, so a name never spills off the card.
    function _char(bytes memory b, uint256 i) internal pure returns (uint256 width, uint8 kind) {
        uint8 c = uint8(b[i]);
        if (c < 0x80) {
            if (c < 0x20 || c == 0x7F) c = 0x3F; // control characters are shown as "?"
            return (uint8(WIDTHS[c - 0x20]), PLAIN);
        }
        bytes4 h = 0; // the character's bytes, up to 4
        for (uint256 j = 0; j < 4 && i + j < b.length; ++j) {
            h |= bytes4(b[i + j]) >> (8 * j);
        }
        if ((h & 0xFFFFFF00) == 0xE2808D00) return (0, JOINER); // U+200D
        if ((h & 0xFFFFF000) == 0xEFB88000) return (0, MARK); // U+FE00 to U+FE0F
        if (h >= 0xF3A080A0 && h <= 0xF3A081BF) return (0, MARK); // tags, U+E0020 to U+E007F
        if ((h & 0xFFFFFF00) == 0xE283A300) return (WIDE, MARK); // keycap, U+20E3
        if (h >= 0xF09F8FBB && h <= 0xF09F8FBF) return (WIDE, MARK); // skin tones, U+1F3FB to U+1F3FF
        if (h >= 0xF09F87A6 && h <= 0xF09F87BF) return (WIDE, FLAG_LETTER); // U+1F1E6 to U+1F1FF
        return (WIDE, PLAIN);
    }

    /// @dev `s` inside a JSON string: quotes, backslashes and control characters escaped.
    function _jsonEscape(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length * 6);
        uint256 n = 0;
        for (uint256 i = 0; i < b.length; ++i) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\") {
                out[n++] = "\\";
                out[n++] = c;
            } else if (uint8(c) < 0x20) {
                out[n++] = "\\";
                out[n++] = "u";
                out[n++] = "0";
                out[n++] = "0";
                out[n++] = _hex(uint8(c) >> 4);
                out[n++] = _hex(uint8(c) & 0x0F);
            } else {
                out[n++] = c;
            }
        }
        return _trim(out, n);
    }

    /// @dev `s` as SVG text: markup characters as entities, control characters (not allowed) as "?".
    function _xmlEscape(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length * 6);
        uint256 n = 0;
        for (uint256 i = 0; i < b.length; ++i) {
            bytes1 c = b[i];
            bytes memory entity = c == "&"
                ? bytes("&amp;")
                : c == "<"
                    ? bytes("&lt;")
                    : c == ">" ? bytes("&gt;") : c == '"' ? bytes("&quot;") : c == "'" ? bytes("&#39;") : bytes("");
            if (entity.length != 0) {
                for (uint256 j = 0; j < entity.length; ++j) {
                    out[n++] = entity[j];
                }
            } else if (uint8(c) < 0x20) {
                out[n++] = "?";
            } else {
                out[n++] = c;
            }
        }
        return _trim(out, n);
    }

    /// @dev `s` in a link: everything but letters, digits and -._~ percent-encoded (UTF-8 bytes).
    function _urlEncode(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length * 3);
        uint256 n = 0;
        for (uint256 i = 0; i < b.length; ++i) {
            uint8 c = uint8(b[i]);
            bool plain = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c == 0x2D
                || c == 0x2E || c == 0x5F || c == 0x7E;
            if (plain) {
                out[n++] = b[i];
            } else {
                out[n++] = "%";
                out[n++] = _hex(c >> 4);
                out[n++] = _hex(c & 0x0F);
            }
        }
        return _trim(out, n);
    }

    function _hex(uint8 nibble) internal pure returns (bytes1) {
        return bytes1(nibble < 10 ? nibble + 0x30 : nibble + 0x37);
    }

    /// @dev The first `n` bytes of `b`, as a string, without copying.
    function _trim(bytes memory b, uint256 n) internal pure returns (string memory) {
        assembly ("memory-safe") {
            mstore(b, n)
        }
        return string(b);
    }
}
