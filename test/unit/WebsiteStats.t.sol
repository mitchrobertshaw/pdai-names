// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IRegistryEvents} from "@ensv2/registry/interfaces/IRegistryEvents.sol";

/// @notice The website follows the .hex registry by its events (web/src/lib/stats.ts): new names
///         for the homepage's live numbers, and transfers, renewals and removals for the app's
///         My names. This checks it listens for the events the registry really emits.
contract WebsiteStatsTest is Test {
    function test_theWebsiteFollowsTheRegistrysEvents() public {
        string memory source = vm.readFile("web/src/lib/stats.ts");
        bytes32[5] memory topics = [
            IRegistryEvents.LabelRegistered.selector,
            IERC1155.TransferSingle.selector,
            IERC1155.TransferBatch.selector,
            IRegistryEvents.ExpiryUpdated.selector,
            IRegistryEvents.LabelUnregistered.selector
        ];
        for (uint256 i = 0; i < topics.length; ++i) {
            assertTrue(vm.contains(source, vm.toString(topics[i])), "web/src/lib/stats.ts must follow every registry event");
        }
    }
}
