# Ethereum: step 2

**Yes, .hex is deployed on Ethereum too.** Names live on PulseChain, and step 2 puts the other half
on Ethereum. New to this? [Start here](../README.md).

| What step 2 deploys | What it's for |
|---|---|
| ENSv2's registries and resolvers (the contracts that store names and answer lookups), and `UniversalResolverV2` | the Ethereum copy of `.hex`, so Ethereum apps and wallets can look `.hex` names up |
| [`HexMirrorRegistrar`](../../src/ethereum/HexMirrorRegistrar.sol) | the only thing that writes that copy, from bridge messages sent from PulseChain |
| [`HexOrderBook`](../../src/ethereum/HexOrderBook.sol) | orders from Ethereum: switched off (the site doesn't offer them, the bot ignores them), kept for later |

Without step 2, names would work only on PulseChain.

| | Sepolia (the rehearsal) | Ethereum (for real) |
|---|---|---|
| Chain ID | 11155111 | 1 |
| Coin | Sepolia ETH, free | ETH |
| RPC the workflow uses | `https://ethereum-sepolia-rpc.publicnode.com` | `https://ethereum-rpc.publicnode.com` |
| Explorer | [sepolia.etherscan.io](https://sepolia.etherscan.io) | [etherscan.io](https://etherscan.io) |
| Its PulseChain side | PulseChain Testnet v4 | PulseChain |

## Sepolia ETH

The deployer needs 0.01 Sepolia ETH. Step 2 costs about 0.0015. The bot needs 0.01 too.

Faucets (sites that give out test coins) come and go. On 7 November 2026 these were up:

- [Google Cloud's faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia), with a
  Google account.
- [sepolia-faucet.pk910.de](https://sepolia-faucet.pk910.de), which has your browser do some work
  for a few minutes instead.

## Step 2: deploy on Ethereum and link it

After [step 1](../pulsechain/README.md#step-1-deploy-on-pulsechain). On GitHub: **Actions**, then
**deploy**, then **Run workflow**.

| Field | Fill in |
|---|---|
| Network | the same as step 1 |
| Step | 2. Deploy on Ethereum and link it |
| Send it for real | unticked for the dry run, then ticked |
| Mainnet only, when sending for real | type `mainnet` |
| Admin wallet | the same admin as step 1. On Ethereum it only owns two minor settings (the list of lookup gateways, and the contract namer) and has no say over names |
| `PULSECHAIN_MIRROR_SYNC`, `PULSECHAIN_ORDER_FILLER` | from step 1's summary |

Before it sends anything, it checks on PulseChain that those two addresses are .hex contracts from
the same step 1, deployed with the same key for the same network, and not linked yet. Then it
deploys about 19 transactions' worth of contracts and links them to step 1's, for good. That takes
5 to 10 minutes.

**What to copy from the summary:**

| Line | Where it goes |
|---|---|
| `ETHEREUM_MIRROR_REGISTRAR`, `ETHEREUM_ORDER_BOOK` | into the step 3 form |
| the **For the bot** block | into the bot's settings on Railway, after step 1's ([the bot guide](../bot/README.md)) |
| `ETHEREUM_ORDER_BOOK` | into `web/src/deployment.ts` too ([the website guide](../website/README.md)) |
| `UniversalResolver` | for wallets that add .hex: where they look names up on Ethereum |
| `.hex registry (copy)`, Root registry, Default resolver and the rest | nowhere: for reference |

Then do [step 3 on PulseChain](../pulsechain/README.md#step-3-link-pulsechain).

## Mainnet

- **Have about 0.02 ETH.** Step 2 cost about 0.0023 ETH on 5 November 2026.
- **The admin can't be a "smart account".** Some wallets, MetaMask among them, offer to upgrade an
  account into one (an EIP-7702 delegation). Many of these can't hold the `hex` token, so steps 1
  and 2 refuse them. Use a plain wallet.
- **Not automated yet:** verifying the contracts on [etherscan.io](https://etherscan.io).

## Ethereum's next upgrade

Sepolia already has Ethereum's next upgrade, which makes creating contracts there cost about 7 times
the gas: step 2 uses about 146 million gas on Sepolia. Gas on Sepolia is close to free, so that
doesn't matter for the rehearsal. The workflow uses Foundry 1.9.0 (the tool that runs the deploy),
which knows about it.

When Ethereum itself gets the upgrade, the newer Foundry releases will know that too. Update the
Foundry version in [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
(`FOUNDRY_VERSION`, with its `FOUNDRY_SHA256`) to a release from after the upgrade before running
step 2 on mainnet, or step 2 will run out of gas. Until then, 1.9.0 is right.