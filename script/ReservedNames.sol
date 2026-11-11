// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Vm} from "forge-std/Vm.sol";

/// @notice A .hex name set aside at deployment, before anyone can buy names.
/// @dev With an owner, the name is registered to that owner straight away, as if they had bought
///      it. Without one, it is held: nobody can buy it, and the admin hands it over once its
///      rightful owner has proved who they are.
struct ReservedName {
    string label; // the name without .hex, e.g. "yourfriendsommi"
    address owner; // who gets it now, or zero to hold it
}

/// @title ReservedNames
/// @notice Reads the reserved names list, `script/reserved-names.csv`, and checks every name in it.
/// @dev The file is a table: a header row `name,wallet,who`, then one name per row. Leave `wallet`
///      empty to hold the name. `who` is a note for people and is not read. Names are lower-cased,
///      as wallets do before looking them up. Used by the deploy script and by the tests.
library ReservedNames {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @notice Reads and checks the list at `path`.
    function read(string memory path) internal view returns (ReservedName[] memory) {
        return parse(VM.readFile(path));
    }

    /// @notice Parses and checks the contents of a reserved names list.
    function parse(string memory csv) internal pure returns (ReservedName[] memory names) {
        string[] memory lines = VM.split(csv, "\n");
        ReservedName[] memory found = new ReservedName[](lines.length);
        uint256 n;
        bool firstRow = true;
        for (uint256 i = 0; i < lines.length; ++i) {
            string memory line = VM.trim(lines[i]);
            if (bytes(line).length == 0) continue;
            string[] memory cells = VM.split(line, ",");
            string memory label = VM.toLowercase(VM.trim(cells[0]));
            string memory wallet = cells.length > 1 ? VM.trim(cells[1]) : "";
            if (firstRow) {
                firstRow = false;
                if (_eq(label, "name") && _eq(VM.toLowercase(wallet), "wallet")) continue; // the header
            }
            requireValidLabel(label);
            address owner;
            if (bytes(wallet).length != 0) {
                owner = VM.parseAddress(wallet);
                require(owner != address(0), string.concat(label, ": the wallet is the zero address"));
            }
            for (uint256 j = 0; j < n; ++j) {
                require(!_eq(found[j].label, label), string.concat(label, " is listed twice"));
            }
            found[n++] = ReservedName(label, owner);
        }
        names = new ReservedName[](n);
        for (uint256 i = 0; i < n; ++i) {
            names[i] = found[i];
        }
    }

    /// @notice Reverts unless `label` is 3 to 63 characters of a-z, 0-9 and hyphens, without
    ///         hyphens in both the 3rd and 4th place.
    /// @dev Stricter than ENS normal form (ENSIP-15), which also allows other scripts and emoji, so
    ///      every reserved name is one wallets look up exactly as written. Names of 1 or 2 characters
    ///      are refused because the registrar could never renew them.
    function requireValidLabel(string memory label) internal pure {
        bytes memory b = bytes(label);
        require(
            b.length >= 3 && b.length <= 63,
            string.concat("\"", label, "\": a reserved name must be 3 to 63 characters")
        );
        for (uint256 i = 0; i < b.length; ++i) {
            bytes1 c = b[i];
            require(
                (c >= bytes1("a") && c <= bytes1("z")) || (c >= bytes1("0") && c <= bytes1("9")) || c == bytes1("-"),
                string.concat("\"", label, "\": a reserved name may only use a-z, 0-9 and -")
            );
        }
        require(
            b.length < 4 || b[2] != bytes1("-") || b[3] != bytes1("-"),
            string.concat("\"", label, "\": a name can't have hyphens in both the 3rd and 4th place")
        );
    }

    function _eq(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
