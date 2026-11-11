// Copies changes to .hex names on PulseChain over to Ethereum.
//
// Purchases through AnyTokenCheckout and HexOrderFiller already send the change. Everything else
// that changes a name on PulseChain (a registration straight through the registrar, a renewal, a
// transfer) is picked up here from the registry's events, and the bot calls HexMirrorSync.sync for
// that name. sync only ever reports what PulseChain says, so there is nothing to trust here.

import { getAbiItem } from "viem";

import { labelStoreAbi, mirrorSyncAbi, registryAbi } from "./abis.ts";
import type { Context } from "./context.ts";
import { send, short } from "./orders.ts";

const LOG_RANGE = 50_000n;
const events = {
  registered: getAbiItem({ abi: registryAbi, name: "LabelRegistered" }),
  unregistered: getAbiItem({ abi: registryAbi, name: "LabelUnregistered" }),
  expiry: getAbiItem({ abi: registryAbi, name: "ExpiryUpdated" }),
  transfer: getAbiItem({ abi: registryAbi, name: "TransferSingle" }),
  transferBatch: getAbiItem({ abi: registryAbi, name: "TransferBatch" }),
  synced: getAbiItem({ abi: mirrorSyncAbi, name: "Synced" }),
};

type Position = { block: bigint; index: number };
const after = (a: Position, b: Position) => a.block > b.block || (a.block === b.block && a.index > b.index);

export async function syncNames(ctx: Context): Promise<void> {
  const { config } = ctx;
  const latest = await ctx.pls.getBlockNumber();
  const labelStore = await ctx.pls.readContract({ address: config.hexRegistry, abi: registryAbi, functionName: "LABEL_STORE" });
  for (let from = BigInt(ctx.state.pulsechainRegistryBlock) + 1n; from <= latest; from += LOG_RANGE) {
    const to = from + LOG_RANGE - 1n < latest ? from + LOG_RANGE - 1n : latest;
    const range = { fromBlock: from, toBlock: to };
    const [registered, unregistered, expiry, transfers, batches, synced] = await Promise.all([
      ctx.pls.getLogs({ address: config.hexRegistry, event: events.registered, ...range }),
      ctx.pls.getLogs({ address: config.hexRegistry, event: events.unregistered, ...range }),
      ctx.pls.getLogs({ address: config.hexRegistry, event: events.expiry, ...range }),
      ctx.pls.getLogs({ address: config.hexRegistry, event: events.transfer, ...range }),
      ctx.pls.getLogs({ address: config.hexRegistry, event: events.transferBatch, ...range }),
      ctx.pls.getLogs({ address: config.mirrorSync, event: events.synced, ...range }),
    ]);

    // The last change and the last sync of each name in this range.
    const changed = new Map<string, Position>();
    const note = (label: string, p: Position) => {
      const prev = changed.get(label);
      if (!prev || after(p, prev)) changed.set(label, p);
    };
    const labelOf = async (tokenId: bigint) =>
      ctx.pls.readContract({ address: labelStore, abi: labelStoreAbi, functionName: "getLabel", args: [tokenId] });
    for (const l of registered) note(l.args.label!, { block: l.blockNumber, index: l.logIndex });
    for (const l of [...unregistered, ...expiry]) note(await labelOf(l.args.tokenId!), { block: l.blockNumber, index: l.logIndex });
    for (const l of transfers) {
      if (l.args.from === "0x0000000000000000000000000000000000000000" || l.args.to === "0x0000000000000000000000000000000000000000") continue; // mint or burn: covered above
      note(await labelOf(l.args.id!), { block: l.blockNumber, index: l.logIndex });
    }
    for (const l of batches) for (const id of l.args.ids ?? []) note(await labelOf(id), { block: l.blockNumber, index: l.logIndex });
    const lastSync = new Map<string, Position>();
    for (const l of synced) {
      const p = { block: l.blockNumber, index: l.logIndex };
      const prev = lastSync.get(l.args.label!);
      if (!prev || after(p, prev)) lastSync.set(l.args.label!, p);
    }

    for (const [label, change] of changed) {
      const synced = lastSync.get(label);
      if (synced && after(synced, change)) continue; // already sent after the change
      if (!label) continue;
      try {
        const tx = await send(ctx, "pls", { address: config.mirrorSync, abi: mirrorSyncAbi, functionName: "sync", args: [label] });
        ctx.log(`${label}.hex changed on PulseChain; copy sent to Ethereum (${tx})`);
      } catch (error) {
        ctx.log(`${label}.hex: could not send the copy: ${short(error)}`);
        return; // retry this range on the next pass
      }
    }
    ctx.state.pulsechainRegistryBlock = to.toString();
  }
}
