// What the site knows about the .hex registry on PulseChain: how many names are registered, which
// were registered last (the homepage's live numbers), and who owns each name (the app's My names).
// The site's functions (netlify/functions) read the new blocks at most about once a minute and
// keep their place between visits, so visitors' browsers never have to scan the chain.

// The registry's events it follows. test/unit/WebsiteStats.t.sol checks each against the contracts.
/** A name registered, bought or given at deployment: LabelRegistered(uint256,bytes32,string,address,uint64,address). */
export const LABEL_REGISTERED = "0x2fe093918572373e9f1f0368f414dffd0043a74ae8c9fd7b0e390b26a0d20b6e";
/** A name changing hands (names are ERC-1155 tokens): TransferSingle(address,address,address,uint256,uint256). */
export const TRANSFER_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
/** Several at once: TransferBatch(address,address,address,uint256[],uint256[]). */
export const TRANSFER_BATCH = "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";
/** A renewal: ExpiryUpdated(uint256,uint64,address). */
export const EXPIRY_UPDATED = "0x3260962d42d8f7ae0af25cbfdb2983c214a859cfa2ac6df8ea29b534c267d429";
/** A name removed: LabelUnregistered(uint256,address). */
export const LABEL_UNREGISTERED = "0x5293e83951c7b759c1ef192ceed240dc2caa652e29ddbd95cafe1d88e5a9cea8";
const FOLLOWED = [LABEL_REGISTERED, TRANSFER_SINGLE, TRANSFER_BATCH, EXPIRY_UPDATED, LABEL_UNREGISTERED];

/** A lapsed name stays its owner's to renew for 28 days. */
const GRACE = 28 * 86_400;

/** PulseChain, and its testnet, make a block every 10 seconds. */
const BLOCK_SECONDS = 10;
const DAY = 86_400;

/** The count shows once it is worth showing. Until then the latest names carry the strip. */
export const SHOW_NAMES_FROM = 100;
export const SHOW_DAY_FROM = 10;

export interface RegistrationLog {
  blockNumber: string;
  data: string;
  topics?: string[];
  blockTimestamp?: string; // some nodes include it
}

/** A name, its owner (lower case) and its expiry (unix seconds). */
export interface Holding {
  label: string;
  owner: string;
  expiry: number;
}

export interface Registration {
  label: string;
  block: number;
  at: number; // unix seconds
}

/** What the functions keep between visits. */
export interface ScanState {
  block: number; // the last block read
  names: number; // names registered so far
  recent: Registration[]; // newest first: the last day's, and always the latest 10
  /** Every name, by its id without the 32 version bits ENSv2 changes as a token is regenerated. */
  holdings: Record<string, Holding>;
}

/** What the homepage shows. */
export interface LiveStats {
  live: true;
  names: number;
  last24h: number;
  latest: { label: string; at: number }[];
}

export type Rpc = (method: string, params: unknown[]) => Promise<unknown>;

/** A JSON-RPC client for `url`. */
export function jsonRpc(url: string, timeoutMs = 8000): Rpc {
  return async (method, params) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error || json.result === undefined || json.result === null) {
      throw new Error(json.error?.message ?? `no answer to ${method}`);
    }
    return json.result;
  };
}

const toHex = (n: number) => `0x${n.toString(16)}`;
const toNumber = (hex: string) => Number(BigInt(hex));

/** The name in a LabelRegistered log, whose data is (string label, address owner, uint64 expiry). */
export function labelOf(data: string): string {
  const hex = data.replace(/^0x/, "");
  const offset = toNumber(`0x${hex.slice(0, 64)}`) * 2;
  const length = toNumber(`0x${hex.slice(offset, offset + 64)}`);
  const bytes = hex.slice(offset + 64, offset + 64 + length * 2);
  if (bytes.length !== length * 2) throw new Error("not a LabelRegistered log");
  return new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) ?? [], (byte) => parseInt(byte, 16)));
}

/** Where to start: the block before the deployment. */
export function freshState(startBlock: number): ScanState {
  return { block: startBlock - 1, names: 0, recent: [], holdings: {} };
}

/** A name's id without its version: the same for every token the name has had. */
export function nameKey(id: string | bigint): string {
  return `0x${(BigInt(id) & ~0xffffffffn).toString(16)}`;
}

const word = (hex: string, i: number) => hex.slice(i * 64, (i + 1) * 64);
const addressIn = (topicOrWord: string) => `0x${topicOrWord.replace(/^0x/, "").slice(-40)}`.toLowerCase();

/**
 * Reads the registrations after `state.block`, up to the chain's head or until `deadline` (in ms),
 * whichever comes first; the next call carries on from there. Narrows its ranges if the RPC
 * refuses wide ones.
 */
export async function scan(
  state: ScanState,
  options: { rpc: Rpc; registry: string; deadline: number; chunk?: number },
): Promise<ScanState & { behind: boolean }> {
  const { rpc, registry, deadline } = options;
  const latest = (await rpc("eth_getBlockByNumber", ["latest", false])) as { number: string; timestamp: string };
  const head = toNumber(latest.number);
  const headTime = toNumber(latest.timestamp);
  let { block, names } = state;
  const recent = [...state.recent];
  const holdings: Record<string, Holding> = structuredClone(state.holdings ?? {});
  let chunk = options.chunk ?? 25_000;
  while (block < head && Date.now() < deadline) {
    const to = Math.min(head, block + chunk);
    let logs: RegistrationLog[];
    try {
      logs = (await rpc("eth_getLogs", [
        { address: registry, topics: [FOLLOWED], fromBlock: toHex(block + 1), toBlock: toHex(to) },
      ])) as RegistrationLog[];
    } catch (error) {
      if (chunk > 500) {
        chunk = Math.floor(chunk / 5);
        continue;
      }
      throw error;
    }
    // Oldest first, so the newest ends up at the front.
    for (const log of logs) {
      const topics = log.topics ?? [LABEL_REGISTERED];
      const data = log.data.replace(/^0x/, "");
      const holding = (id: string) => holdings[nameKey(id)];
      if (topics[0] === LABEL_REGISTERED) {
        names += 1;
        const at = log.blockTimestamp
          ? toNumber(log.blockTimestamp)
          : headTime - (head - toNumber(log.blockNumber)) * BLOCK_SECONDS;
        try {
          const label = labelOf(log.data);
          recent.unshift({ label, block: toNumber(log.blockNumber), at });
          if (topics[1]) {
            holdings[nameKey(topics[1])] = { label, owner: addressIn(word(data, 1)), expiry: toNumber(`0x${word(data, 2)}`) };
          }
        } catch {
          // Counted, but not shown.
        }
      } else if (topics[0] === TRANSFER_SINGLE) {
        const h = holding(`0x${word(data, 0)}`);
        if (h) h.owner = addressIn(topics[3]);
      } else if (topics[0] === TRANSFER_BATCH) {
        const start = toNumber(`0x${word(data, 0)}`) / 32;
        const count = toNumber(`0x${word(data, start)}`);
        for (let i = 1; i <= count; i++) {
          const h = holding(`0x${word(data, start + i)}`);
          if (h) h.owner = addressIn(topics[3]);
        }
      } else if (topics[0] === EXPIRY_UPDATED) {
        const h = holding(topics[1]);
        if (h) h.expiry = toNumber(topics[2]);
      } else if (topics[0] === LABEL_UNREGISTERED) {
        delete holdings[nameKey(topics[1])];
      }
    }
    block = to;
  }
  const dayAgo = headTime - DAY;
  return {
    block,
    names,
    recent: recent.filter((r, i) => i < 10 || r.at > dayAgo).slice(0, 5000),
    holdings,
    behind: block < head,
  };
}

/** Words that keep a name out of the homepage's list of latest names. It still counts. */
const HIDDEN = [
  "airdrop", "admin", "bitch", "cock", "claim", "cunt", "dick", "drain", "fag", "free", "fuck", "giveaway", "hitler",
  "http", "kike", "metamask", "nazi", "nigg", "official", "pedo", "porn", "pussy", "rape", "retard", "scam", "sex",
  "shit", "slut", "spic", "support", "verify", "wallet", "whore", "www",
];

/** Whether a name may appear on the homepage: plain letters, digits and hyphens, and nothing rude. */
export function showable(label: string): boolean {
  return /^[a-z0-9-]{3,20}$/.test(label) && !HIDDEN.some((word) => label.includes(word));
}

/** The numbers for the homepage, as of `now` (unix seconds). */
export function summarise(state: ScanState, now: number): LiveStats {
  return {
    live: true,
    names: state.names,
    last24h: state.recent.filter((r) => r.at > now - DAY).length,
    latest: state.recent
      .filter((r) => showable(r.label))
      .slice(0, 6)
      .map(({ label, at }) => ({ label, at })),
  };
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(at: number, now: number): string {
  const seconds = Math.max(0, now - at);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < DAY) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(seconds / DAY);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** The names `owner` holds as of `now` (unix seconds), lapsed ones still in their grace period included. */
export function ownedBy(state: ScanState, owner: string, now: number): { label: string; expiry: number }[] {
  const who = owner.toLowerCase();
  return Object.values(state.holdings ?? {})
    .filter((h) => h.owner === who && h.expiry + GRACE > now)
    .map(({ label, expiry }) => ({ label, expiry }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
