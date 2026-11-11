// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice A contract wallet that accepts name tokens from one registry only, standing in for an
///         address that is a wallet on PulseChain but something else on Ethereum.
contract PickyReceiver is IERC1155Receiver {
    address public immutable ACCEPTED;

    constructor(address accepted) {
        ACCEPTED = accepted;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external view returns (bytes4) {
        return msg.sender == ACCEPTED ? this.onERC1155Received.selector : bytes4(0);
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        view
        returns (bytes4)
    {
        return msg.sender == ACCEPTED ? this.onERC1155BatchReceived.selector : bytes4(0);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
