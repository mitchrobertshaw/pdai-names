// Checks the bot can claim real bridge messages: finds a PulseChain -> Ethereum message that is
// fully signed but not yet claimed, packs its signatures with the bot's code, and simulates the
// claim on Ethereum (nothing is sent). Run: npm run check-claim
import { createPublicClient, http, parseAbiItem, type Hex } from "viem";
import { mainnet } from "viem/chains";
import { homeAmbAbi, foreignAmbAbi } from "../src/abis.ts";
import { parseAmbMessage, packSignatures, isFullySigned } from "../src/amb.ts";
const pulsechain = { id: 369, name: "PulseChain", nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.pulsechain.com"] } } } as const;
const pls = createPublicClient({ chain: pulsechain, transport: http() });
const eth = createPublicClient({ chain: mainnet, transport: http("https://ethereum-rpc.publicnode.com") });
const HOME = "0x6ef79FD6f9f840264332884240539Ed7A2dA8b2b", FOREIGN = "0xd0764FAe29E0a6a96fF685f71CfC685456D5636c";
const latest = await pls.getBlockNumber();
const logs = await pls.getLogs({ address: HOME, event: parseAbiItem("event UserRequestForSignature(bytes32 indexed messageId, bytes encodedData)"), fromBlock: latest - 8640n * 3n, toBlock: latest });
const required = await pls.readContract({ address: HOME, abi: homeAmbAbi, functionName: "requiredSignatures" });
console.log(`messages in the last ~3 days: ${logs.length}; signatures required: ${required}`);
let tried = 0, unclaimed = 0;
for (const log of logs.reverse()) {
  const m = parseAmbMessage(log.args.encodedData as Hex);
  const signed = await pls.readContract({ address: HOME, abi: homeAmbAbi, functionName: "numMessagesSigned", args: [m.hash] });
  if (!isFullySigned(signed, required)) continue;
  const relayed = await eth.readContract({ address: FOREIGN, abi: foreignAmbAbi, functionName: "relayedMessages", args: [m.messageId] });
  if (relayed) continue;
  unclaimed++;
  const sigs: Hex[] = [];
  for (let i = 0n; i < required; i++) sigs.push(await pls.readContract({ address: HOME, abi: homeAmbAbi, functionName: "signature", args: [m.hash, i] }));
  const packed = packSignatures(sigs);
  tried++;
  try {
    await eth.simulateContract({ address: FOREIGN, abi: foreignAmbAbi, functionName: "executeSignatures", args: [m.encoded, packed], account: "0x000000000000000000000000000000000000dEaD", gas: m.gasLimit + 500_000n });
    console.log(`CLAIM WOULD SUCCEED: message ${m.messageId} from ${m.sender} to ${m.executor}, gas ${m.gasLimit}`);
    // And with one signature corrupted it must fail:
    const bad = [...sigs]; bad[0] = (bad[0]!.slice(0, 10) + (bad[0]![10] === "0" ? "1" : "0") + bad[0]!.slice(11)) as Hex;
    try { await eth.simulateContract({ address: FOREIGN, abi: foreignAmbAbi, functionName: "executeSignatures", args: [m.encoded, packSignatures(bad)], account: "0x000000000000000000000000000000000000dEaD", gas: m.gasLimit + 500_000n }); console.log("  !! corrupted signature was accepted"); }
    catch { console.log("  a corrupted signature is rejected, as it should be"); }
    break;
  } catch (e: any) { console.log(`simulation reverted for ${m.messageId}: ${(e.shortMessage || e.message).split("\n")[0]}`); if (tried >= 3) break; }
}
console.log(`fully signed but unclaimed: ${unclaimed}; simulated: ${tried}`);
