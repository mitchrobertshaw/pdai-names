// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IRentPriceOracle} from "@ensv2/registrar/interfaces/IRentPriceOracle.sol";

/// @title HexNameRules
/// @notice Sits between the .hex registrar and its price oracle, and keeps three rules:
///         - New names are plain: lowercase letters a to z, digits 0 to 9 and hyphens, the names
///           the app sells, without "--" as their 3rd and 4th characters, which ENS's rules keep
///           for encoded names such as "xn--". So nobody can buy a name the app wouldn't sell by
///           going around it: no capitals, spaces, symbols, emoji or look-alike letters.
///         - New names are at most 63 characters: the most one part of a web address can hold, so
///           every .hex name can also work as one.
///         - A name is paid for at most 5 years ahead: a registration is at most 5 years, and a
///           renewal can't take the expiry more than 5 years past today. An owner can always renew
///           back up to 5 years ahead, so nobody is ever kept from keeping their name.
///         A name that breaks either of the first two rules can't be priced, so it can't be
///         registered: it fails with the oracle's own `NotValid`, as a name that's too short does.
///         Prices are the oracle's, and the admin still manages them there.
contract HexNameRules is IRentPriceOracle, IERC165 {
    /// @notice The longest name that can be registered, in bytes: 63 characters, as a name's
    ///         letters, digits and hyphens are a byte each.
    uint256 public constant MAX_LENGTH = 63;

    /// @notice How far ahead a name can be paid for: 5 years of 365 days, as the oracle counts them.
    uint64 public constant MAX_TERM = 5 * 365 days;

    /// @notice The oracle that prices every name.
    IRentPriceOracle public immutable ORACLE;

    /// @notice A registration or renewal would take `label`'s expiry to `newExpiry`, past `latest`.
    error TooFarAhead(string label, uint256 newExpiry, uint256 latest);

    constructor(IRentPriceOracle oracle) {
        ORACLE = oracle;
    }

    /// @inheritdoc IRentPriceOracle
    function getRegisterPrice(string calldata label, uint64 available, uint64 duration, IERC20 paymentToken)
        external
        view
        returns (uint256 base, uint256 premium)
    {
        if (bytes(label).length > MAX_LENGTH || !isPlain(label)) revert NotValid(label);
        if (duration > MAX_TERM) {
            revert TooFarAhead(label, block.timestamp + duration, block.timestamp + MAX_TERM);
        }
        return ORACLE.getRegisterPrice(label, available, duration, paymentToken);
    }

    /// @inheritdoc IRentPriceOracle
    function getRenewPrice(string calldata label, uint64 expiry, uint64 duration, IERC20 paymentToken)
        external
        view
        returns (uint256)
    {
        uint256 newExpiry = uint256(expiry) + duration;
        if (newExpiry > block.timestamp + MAX_TERM) revert TooFarAhead(label, newExpiry, block.timestamp + MAX_TERM);
        return ORACLE.getRenewPrice(label, expiry, duration, paymentToken);
    }

    /// @notice Whether `label` is made only of what a new .hex name may use: lowercase letters a
    ///         to z, digits 0 to 9 and hyphens, and doesn't have "--" as its 3rd and 4th characters.
    function isPlain(string calldata label) public pure returns (bool) {
        bytes calldata b = bytes(label);
        for (uint256 i = 0; i < b.length; ++i) {
            bytes1 c = b[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-")) return false;
        }
        return !(b.length >= 4 && b[2] == "-" && b[3] == "-");
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IRentPriceOracle).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
