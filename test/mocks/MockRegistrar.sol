// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IRegistrarLike} from "../../src/interfaces/IRegistrarLike.sol";

/// @notice Stand-in for an ENSv2 `ETHRegistrar`, covering what matters to the checkout:
///         commit-then-register, a per-second price in one stablecoin, an optional premium,
///         and payment pulled from `msg.sender` to a beneficiary.
/// @dev Simplified on purpose: no grace period, no roles, no subregistries.
contract MockRegistrar is IRegistrarLike {
    using SafeERC20 for IERC20;

    uint64 public constant MIN_COMMITMENT_AGE = 60;
    uint64 public constant MAX_COMMITMENT_AGE = 1 days;

    IERC20 public immutable PAYMENT_TOKEN;
    address public immutable BENEFICIARY;
    uint256 public immutable RATE_PER_SECOND;

    uint256 public premium;
    mapping(bytes32 commitment => uint64 time) public commitmentAt;
    mapping(uint256 tokenId => address) public ownerOf;
    mapping(uint256 tokenId => uint64) public expiry;

    error InvalidOwner();
    error NotPaymentToken();
    error Unavailable(string label);
    error NotRegistered(string label);
    error NoCommitment();
    error CommitmentTooNew();
    error CommitmentTooOld();

    constructor(IERC20 paymentToken, address beneficiary, uint256 ratePerSecond) {
        PAYMENT_TOKEN = paymentToken;
        BENEFICIARY = beneficiary;
        RATE_PER_SECOND = ratePerSecond;
    }

    function setPremium(uint256 premium_) external {
        premium = premium_;
    }

    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(label, owner, secret, subregistry, resolver, duration, referrer));
    }

    function commit(bytes32 commitment) external {
        commitmentAt[commitment] = uint64(block.timestamp);
    }

    function tokenIdOf(string calldata label) public pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    function isAvailable(string calldata label) public view returns (bool) {
        return expiry[tokenIdOf(label)] < block.timestamp;
    }

    function getRegisterPrice(string calldata label, uint64 duration, IERC20 paymentToken)
        public
        view
        returns (uint256 base, uint256 premium_)
    {
        if (address(paymentToken) != address(PAYMENT_TOKEN)) revert NotPaymentToken();
        if (!isAvailable(label)) revert Unavailable(label);
        return (RATE_PER_SECOND * duration, premium);
    }

    function getRenewPrice(string calldata label, uint64 duration, IERC20 paymentToken) public view returns (uint256) {
        if (address(paymentToken) != address(PAYMENT_TOKEN)) revert NotPaymentToken();
        if (isAvailable(label)) revert NotRegistered(label);
        return RATE_PER_SECOND * duration;
    }

    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        IERC20 paymentToken,
        bytes32 referrer
    ) external returns (uint256 tokenId) {
        if (owner == address(0)) revert InvalidOwner();
        _consume(makeCommitment(label, owner, secret, subregistry, resolver, duration, referrer));
        (uint256 base, uint256 premium_) = getRegisterPrice(label, duration, paymentToken);
        paymentToken.safeTransferFrom(msg.sender, BENEFICIARY, base + premium_);
        tokenId = tokenIdOf(label);
        ownerOf[tokenId] = owner;
        expiry[tokenId] = uint64(block.timestamp) + duration;
    }

    function renew(string calldata label, uint64 duration, IERC20 paymentToken, bytes32) external {
        uint256 price = getRenewPrice(label, duration, paymentToken);
        paymentToken.safeTransferFrom(msg.sender, BENEFICIARY, price);
        expiry[tokenIdOf(label)] += duration;
    }

    function _consume(bytes32 commitment) private {
        uint64 madeAt = commitmentAt[commitment];
        if (madeAt == 0) revert NoCommitment();
        if (block.timestamp < madeAt + MIN_COMMITMENT_AGE) revert CommitmentTooNew();
        if (block.timestamp > madeAt + MAX_COMMITMENT_AGE) revert CommitmentTooOld();
        delete commitmentAt[commitment];
    }
}
