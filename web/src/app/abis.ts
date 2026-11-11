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

/** HexNameRules, between the registrar and its price oracle. */
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
  // The same, also paying the copy fee to have the name copied to Ethereum at once (copy.ts).
  {
    type: "function",
    name: "registerWithTokenAndCopy",
    stateMutability: "nonpayable",
    inputs: [registration, { type: "address", name: "tokenIn" }, uint("amountIn"), swap, uint("copyFeeLimit")],
    outputs: [uint("tokenId"), uint("change"), uint("fee")],
  },
  {
    type: "function",
    name: "registerWithPLSAndCopy",
    stateMutability: "payable",
    inputs: [registration, swap, uint("copyFeeLimit")],
    outputs: [uint("tokenId"), uint("change"), uint("fee")],
  },
  {
    type: "function",
    name: "renewWithTokenAndCopy",
    stateMutability: "nonpayable",
    inputs: [renewal, { type: "address", name: "tokenIn" }, uint("amountIn"), swap, uint("copyFeeLimit")],
    outputs: [uint("change"), uint("fee")],
  },
  {
    type: "function",
    name: "renewWithPLSAndCopy",
    stateMutability: "payable",
    inputs: [renewal, swap, uint("copyFeeLimit")],
    outputs: [uint("change"), uint("fee")],
  },
  {
    type: "function",
    name: "payCopyFee",
    stateMutability: "nonpayable",
    inputs: [{ type: "string", name: "label" }, { type: "address", name: "tokenIn" }, uint("amountIn"), swap],
    outputs: [uint("fee"), uint("change")],
  },
  {
    type: "function",
    name: "payCopyFeeWithPLS",
    stateMutability: "payable",
    inputs: [{ type: "string", name: "label" }, swap],
    outputs: [uint("fee"), uint("change")],
  },
  ...parseAbi([
    "function quoteRegister(string label, uint64 duration, address router, address[] path) view returns (uint256 price, uint256 amountIn)",
    "function quoteRenew(string label, uint64 duration, address router, address[] path) view returns (uint256 price, uint256 amountIn)",
    "function quoteRegisterAndCopy(string label, uint64 duration, address router, address[] path) view returns (uint256 price, uint256 fee, uint256 amountIn)",
    "function quoteRenewAndCopy(string label, uint64 duration, address router, address[] path) view returns (uint256 price, uint256 fee, uint256 amountIn)",
    "function quoteCopyFee(address router, address[] path) view returns (uint256 fee, uint256 amountIn)",
    // The copy fee: set by the bot, capped by the admin (the checkout's owner).
    "function copyFee() view returns (uint256)",
    "function maxCopyFee() view returns (uint256)",
    "function copyBot() view returns (address)",
    "function owner() view returns (address)",
    "function setCopyBot(address bot)",
    "function setMaxCopyFee(uint256 maxFee)",
    "function MIRROR_SYNC() view returns (address)",
    "event CopyPaid(string label, address indexed payer, uint256 fee, bytes32 indexed messageId)",
    // Why a payment would be refused, so the app can say it plainly (flows.ts errorText).
    "error InsufficientPayment(uint256 received, uint256 needed)",
    "error NameNotAvailable(string label)",
    "error CommitmentTooNew(bytes32 commitment, uint64 validFrom, uint64 blockTimestamp)",
    "error CommitmentTooOld(bytes32 commitment, uint64 validTo, uint64 blockTimestamp)",
    "error TooFarAhead(string label, uint256 newExpiry, uint256 latest)",
    "error NoCopyFee()",
    "error CopyFailed()",
    "error OwnableUnauthorizedAccount(address account)",
  ]),
] as const;

/** HexMirrorSync on PulseChain: sends a name's state to its Ethereum copy. */
export const mirrorSyncAbi = parseAbi([
  "function sync(string label) returns (bytes32 messageId)",
  "function peer() view returns (address)",
  "function AMB() view returns (address)",
  "event Synced(string label, address indexed owner, uint64 expiry, uint64 indexed nonce, bytes32 indexed messageId)",
]);

/** HexMirrorRegistrar on Ethereum: writes the copies into Ethereum's .hex registry. */
export const mirrorRegistrarAbi = parseAbi([
  "function REGISTRY() view returns (address)",
  "function AMB() view returns (address)",
  "function lastNonce(uint256 labelId) view returns (uint64)",
]);

/** The bridge's message contract on PulseChain: messages to Ethereum, and the validators' signatures. */
export const homeAmbAbi = parseAbi([
  "event UserRequestForSignature(bytes32 indexed messageId, bytes encodedData)",
  "function numMessagesSigned(bytes32 message) view returns (uint256)",
  "function signature(bytes32 hash, uint256 index) view returns (bytes)",
  "function requiredSignatures() view returns (uint256)",
]);

/** The bridge's message contract on Ethereum: anyone may deliver a signed message, paying its fee. */
export const foreignAmbAbi = parseAbi([
  "function executeSignatures(bytes data, bytes signatures)",
  "function relayedMessages(bytes32 messageId) view returns (bool)",
]);

export const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);
