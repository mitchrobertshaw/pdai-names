// The parts of the contracts the app calls (src/ in the repo root, and ENSv2).

import { parseAbi } from "viem";

/** ENSv2's ETHRegistrar: commitments and prices. */
export const registrarAbi = parseAbi([
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MAX_COMMITMENT_AGE() view returns (uint64)",
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function BENEFICIARY() view returns (address)",
  "function rentPriceOracle() view returns (address)",
]);

/** PdaiNameRules, between the registrar and its price oracle. */
export const rulesAbi = parseAbi(["function ORACLE() view returns (address)"]);

/** ENSv2's StandardRentPriceOracle: what the admin's "all prices together" changes. */
export const oracleAbi = parseAbi([
  "function getBaseRates() view returns (uint256[])",
  "function getPaymentTokenRatio(address paymentToken) view returns (uint128 numer, uint128 denom)",
  "function updatePaymentToken(address paymentToken, uint128 numer, uint128 denom)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "event PaymentTokenUpdated(address indexed paymentToken, uint128 numer, uint128 denom)",
]);

/**
 * Disperse (disperse.app): pays many wallets from one approval, in one transaction. On Ethereum since
 * 2018, and at the same address, with the same code, on PulseChain and PulseChain Testnet v4.
 */
export const DISPERSE = "0xD152f549545093347A162Dce210e7293f1452150" as const;
export const disperseAbi = parseAbi(["function disperseToken(address token, address[] recipients, uint256[] values)"]);

/** An ERC-20 transfer, to find payouts already sent. */
export const transferEvent = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/** ENSv2's PermissionedRegistry: who owns a name, and until when. Names are ERC-1155 tokens. */
export const registryAbi = parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State)",
  "function getOwner(uint256 anyId) view returns (address)",
  "function LABEL_STORE() view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  // The admin's powers (the admin page): roles, holding names and handing them out, adding time.
  "function roles(uint256 resource, address account) view returns (uint256)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function renew(uint256 anyId, uint64 newExpiry)",
  "event LabelReserved(uint256 indexed tokenId, bytes32 indexed labelHash, string label, uint64 expiry, address indexed sender)",
  "error LabelAlreadyRegistered(string label)",
  "error LabelAlreadyReserved(string label)",
  "error CannotSetPastExpiry(uint64 expiry)",
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotGrantRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotRevokeRoles(uint256 resource, uint256 roleBitmap, address account)",
]);

/** ENSv2's LabelStore: each name's label, by its id (keccak256 of the label, as referral tags are). */
export const labelStoreAbi = parseAbi(["function getLabel(uint256 anyId) view returns (string)"]);

/** The registrar's records of each purchase and renewal, with what was paid and the referral tag. */
export const registrarEvents = parseAbi([
  "event NameRegistered(uint256 indexed tokenId, string label, address owner, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 indexed referrer, uint256 base, uint256 premium)",
  "event NameRenewed(uint256 indexed tokenId, string label, uint64 duration, uint64 newExpiry, address paymentToken, bytes32 indexed referrer, uint256 amount)",
]);

/** AnyTokenCheckout: buys and renews with any token or PLS. Written out in full: the registration
 *  struct is too long for TypeScript to read from viem's one-line format. */
const registration = {
  type: "tuple",
  name: "reg",
  components: [
    { type: "string", name: "label" },
    { type: "address", name: "owner" },
    { type: "bytes32", name: "secret" },
    { type: "address", name: "subregistry" },
    { type: "address", name: "resolver" },
    { type: "uint64", name: "duration" },
    { type: "bytes32", name: "referrer" },
  ],
} as const;

const renewal = {
  type: "tuple",
  name: "ren",
  components: [
    { type: "string", name: "label" },
    { type: "uint64", name: "duration" },
    { type: "bytes32", name: "referrer" },
  ],
} as const;

const swap = {
  type: "tuple",
  name: "swap",
  components: [
    { type: "address", name: "router" },
    { type: "address[]", name: "path" },
    { type: "uint256", name: "amountOutMin" },
    { type: "uint256", name: "deadline" },
  ],
} as const;

const uint = (name: string) => ({ type: "uint256", name }) as const;

export const checkoutAbi = [
  {
    type: "function",
    name: "registerWithToken",
    stateMutability: "nonpayable",
    inputs: [registration, { type: "address", name: "tokenIn" }, uint("amountIn"), swap],
    outputs: [uint("tokenId"), uint("change")],
  },
  {
    type: "function",
    name: "registerWithPLS",
    stateMutability: "payable",
    inputs: [registration, swap],
    outputs: [uint("tokenId"), uint("change")],
  },
  {
    type: "function",
    name: "renewWithToken",
    stateMutability: "nonpayable",
    inputs: [renewal, { type: "address", name: "tokenIn" }, uint("amountIn"), swap],
    outputs: [uint("change")],
  },
  {
    type: "function",
    name: "renewWithPLS",
    stateMutability: "payable",
    inputs: [renewal, swap],
    outputs: [uint("change")],
  },
  ...parseAbi([
    "function quoteRegister(string label, uint64 duration, address router, address[] path) view returns (uint256 price, uint256 amountIn)",
    "function quoteRenew(string label, uint64 duration, address router, address[] path) view returns (uint256 price, uint256 amountIn)",
    // Why a payment would be refused, so the app can say it plainly (flows.ts errorText).
    "error InsufficientPayment(uint256 received, uint256 needed)",
    "error NameNotAvailable(string label)",
    "error CommitmentTooNew(bytes32 commitment, uint64 validFrom, uint64 blockTimestamp)",
    "error CommitmentTooOld(bytes32 commitment, uint64 validTo, uint64 blockTimestamp)",
    "error TooFarAhead(string label, uint256 newExpiry, uint256 latest)",
  ]),
] as const;

export const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);
