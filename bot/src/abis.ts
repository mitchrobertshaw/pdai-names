// The parts of each contract the bot uses.

import { parseAbi } from "viem";

export const orderBookAbi = parseAbi([
  "event OrderPlaced(uint256 indexed orderId, address indexed buyer, bytes32 indexed commitment, uint256 amount, uint64 deadline, bytes encryptedReveal)",
  "function orders(uint256 orderId) view returns (address buyer, uint96 amount, bytes32 commitment, uint64 deadline, uint8 status)",
  "function owed(address account) view returns (uint256)",
  "function withdraw()",
]);

export const ORDER_STATUS = { NONE: 0, OPEN: 1, FILLED: 2, REFUNDED: 3, RECLAIMED: 4 } as const;

export const orderFillerAbi = parseAbi([
  "struct Reveal { string label; address owner; bytes32 secret; address subregistry; address resolver; uint64 duration; bytes32 referrer; }",
  "function fill(uint256 orderId, uint64 deadline, Reveal reveal, address paymentToken, address payee) returns (uint256 tokenId)",
  "function reportUnfillable(uint256 orderId, uint64 deadline, Reveal reveal) returns (bytes32 messageId)",
  "function reportExpired(uint256 orderId, bytes32 commitment, uint64 deadline) returns (bytes32 messageId)",
  "function orderKey(uint256 orderId, bytes32 commitment, uint64 deadline) pure returns (bytes32)",
  "function outcomeOf(bytes32 orderKey) view returns (uint8)",
  "function canRegister(Reveal reveal) view returns (bool)",
]);

export const OUTCOME = { OPEN: 0, FILLED: 1, UNFILLABLE: 2 } as const;

export const registrarAbi = parseAbi([
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MAX_COMMITMENT_AGE() view returns (uint64)",
  "function BENEFICIARY() view returns (address)",
]);

export const registryAbi = parseAbi([
  "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
  "event LabelUnregistered(uint256 indexed tokenId, address indexed sender)",
  "event ExpiryUpdated(uint256 indexed tokenId, uint64 indexed newExpiry, address indexed sender)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "function LABEL_STORE() view returns (address)",
]);

export const labelStoreAbi = parseAbi(["function getLabel(uint256 anyId) view returns (string)"]);

export const mirrorSyncAbi = parseAbi([
  "event Synced(string label, address indexed owner, uint64 expiry, uint64 indexed nonce, bytes32 indexed messageId)",
  "function sync(string label) returns (bytes32 messageId)",
]);

/** AnyTokenCheckout's copy fee: the bot keeps it up to date, and copies names paid for first. */
export const checkoutAbi = parseAbi([
  "event CopyPaid(string label, address indexed payer, uint256 fee, bytes32 indexed messageId)",
  "function copyBot() view returns (address)",
  "function maxCopyFee() view returns (uint256)",
  "function copyFee() view returns (uint256)",
  "function owner() view returns (address)",
  "function setCopyFee(uint256 fee)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
]);

/** PulseX and Uniswap V2 routers (PulseX names PLS "ETH", as Uniswap does ETH). */
export const routerAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

/** The official bridge's token contracts (OmniBridge): on PulseChain and on Ethereum. */
export const tokenBridgeAbi = parseAbi([
  "function relayTokens(address token, address receiver, uint256 value)",
]);

/** What the official bridge's token contract asks of its Ethereum side, to hand over tokens sent from PulseChain. */
export const tokenBridgeCallsAbi = parseAbi([
  "function handleNativeTokens(address token, address receiver, uint256 value)",
  "function handleBridgedTokens(address token, address receiver, uint256 value)",
]);

export const homeAmbAbi = parseAbi([
  "event UserRequestForSignature(bytes32 indexed messageId, bytes encodedData)",
  "function messageCallStatus(bytes32 messageId) view returns (bool)",
  "function numMessagesSigned(bytes32 message) view returns (uint256)",
  "function signature(bytes32 hash, uint256 index) view returns (bytes)",
  "function requiredSignatures() view returns (uint256)",
]);

/** The two calls PulseChain sends to Ethereum, for reading messages before claiming them. */
export const bridgeCallsAbi = parseAbi([
  "function settle(uint256 orderId, bytes32 commitment, uint64 deadline, address payee, bool filled)",
  "function mirror(string label, address owner, uint64 expiry, uint64 nonce)",
]);

export const mirrorRegistrarAbi = parseAbi([
  "function lastNonce(uint256 labelId) view returns (uint64)",
  "function REGISTRY() view returns (address)",
]);

export const mirrorRegistryAbi = parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State)",
]);

export const REGISTERED = 2; // IPermissionedRegistry.Status.REGISTERED

export const foreignAmbAbi = parseAbi([
  "event UserRequestForAffirmation(bytes32 indexed messageId, bytes encodedData)",
  "function executeSignatures(bytes data, bytes signatures)",
  "function relayedMessages(bytes32 messageId) view returns (bool)",
  "function requiredSignatures() view returns (uint256)",
]);
