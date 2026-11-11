# PulseChain: steps 1 and 3

Names live on PulseChain. Step 1 puts .hex there. Step 3 comes after step 2 on Ethereum, and links
the two chains. New to this? [Start here](../README.md).

| | PulseChain Testnet v4 (the rehearsal) | PulseChain (for real) |
|---|---|---|
| Chain ID (the number wallets use to tell chains apart) | 943 | 369 |
| Coin | tPLS, free | PLS |
| RPC (the web address programs use to talk to the chain) | `https://rpc.v4.testnet.pulsechain.com` | `https://rpc.pulsechain.com` |
| Explorer (look up transactions and contracts) | [scan.v4.testnet.pulsechain.com](https://scan.v4.testnet.pulsechain.com) | [scan.pulsechain.com](https://scan.pulsechain.com) |
| Faucet (free test coins) | [faucet.v4.testnet.pulsechain.com](https://faucet.v4.testnet.pulsechain.com), 10 tPLS a request | |
| Its Ethereum side | Sepolia | Ethereum |

To add the testnet to your wallet, open [chainlist.org/chain/943](https://chainlist.org/chain/943),
connect your wallet, and add the network from there.

## The deployer's PLS

- **Testnet:** 10 tPLS, one request at the faucet. Steps 1 and 3 cost about 0.03 tPLS.
- **Mainnet:** have about 50,000 PLS. Step 1 uses about 30 million gas, which cost about 15,000 PLS
  on 7 November 2026 and twice that two days earlier: the price of gas moves a lot. Step 3 costs
  under 100 PLS.

## Testnets: USDC from Sepolia

Names are priced in USDC (a dollar stablecoin), and whatever a buyer pays with is swapped into it.
On mainnet that's USDC bridged from Ethereum. On the testnet it's Circle's test USDC, bridged from
Sepolia, which the testnet bridge calls "USDC from Sepolia". Its copy on the testnet only appears
once someone has bridged some. On 7 November 2026 nobody had, so step 1 stops until someone does.
Do this once:

1. **Get Sepolia ETH** for gas ([faucets](../ethereum/README.md#sepolia-eth)).
2. **Get test USDC on Sepolia** at [faucet.circle.com](https://faucet.circle.com): choose Ethereum
   Sepolia and paste your wallet's address. (Its address is
   `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, if your wallet asks.)
3. **Bridge it** at [bridge.v4.testnet.pulsechain.com](https://bridge.v4.testnet.pulsechain.com):
   from Sepolia to PulseChain Testnet v4, token USDC, to your own wallet. Send about 30: a name
   costs 10; the rest is for a renewal and the bot's budget. The bot needs no USDC from you: it draws
   what it needs from the budget you set on the app's payments page.
4. **Wait about 15 to 20 minutes** for it to arrive. That's how long the testnet bridge took on
   7 November 2026, much like the real one. To see the token in your wallet, add the address step
   1's summary lists as `PULSECHAIN_USDC`. A dry run of step 1 shows it too.

To check it worked, run step 1 as a dry run. If it gets past the USDC check, you're ready.

On the testnet, pay for names in USDC, not tPLS. Paying in tPLS goes through PulseX (PulseChain's
exchange), and PulseX's testnet has no pool for USDC from Sepolia.

## Step 1: deploy on PulseChain

On GitHub: **Actions**, then **deploy**, then **Run workflow**.

| Field | Fill in |
|---|---|
| Network | Testnet, or Mainnet |
| Step | 1. Deploy on PulseChain |
| Send it for real | unticked for the dry run, then ticked |
| Mainnet only, when sending for real | type `mainnet` |
| Admin wallet | the admin's address ([which wallet](../README.md#what-youll-need)) |
| Who receives payments | already filled in with your wallet, `0x1027…02C6`. Every payment for a name goes straight to it, and it can never be changed after step 1 |

Before it sends anything, it checks:

- that the admin, and the wallet of every reserved name given to someone, can hold a name;
- that neither the admin nor the wallet receiving payments is the deployer, whose key sits in GitHub;
- that the bridge, USDC, DAI, WPLS and PulseX are where they should be.

Then it deploys about 30 transactions' worth of contracts, and sets the reserved names aside. That
takes 5 to 10 minutes.

**What to copy from the summary** (open the finished run, scroll down):

| Line | Where it goes |
|---|---|
| `PULSECHAIN_MIRROR_SYNC`, `PULSECHAIN_ORDER_FILLER` | into the step 2 and step 3 forms |
| `Payments go to` | nowhere: check it's your wallet, `0x102785E63DCD7C2ba1146E96da7fE429155602C6`. The dry run shows it before anything is sent |
| `Price rules locked` | nowhere: check it says `yes, for good`. Nobody, you included, can then change the price of one length, the multi-year prices, which characters names can use, the 63-character limit or the 5-year limit |
| the **For the bot** block | into the bot's settings on Railway ([the bot guide](../bot/README.md)) |
| `PULSECHAIN_HEX_REGISTRY`, `PULSECHAIN_REGISTRAR`, `PULSECHAIN_CHECKOUT`, `PULSECHAIN_USDC`, `START_BLOCK_PULSECHAIN` | into `web/src/deployment.ts` ([the website guide](../website/README.md)) |
| `UniversalResolver` | for wallets that add .hex: where they look names up |
| Root registry, Default resolver, Price oracle and the rest | nowhere: for reference |
| Reserved names given and held | a check against the list |

A real run also saves a full record of everything it sent: on the run's page, under **Artifacts**.

Then do [step 2 on Ethereum](../ethereum/README.md#step-2-deploy-on-ethereum-and-link-it).

## Step 3: link PulseChain

After step 2, and straight after it: until step 3 is done, the deployer's key can still link the
bridge contracts. On GitHub: **Actions**, then **deploy**, then **Run workflow**.

| Field | Fill in |
|---|---|
| Network | the same as steps 1 and 2 |
| Step | 3. Link PulseChain |
| Send it for real | unticked for the dry run, then ticked |
| Mainnet only, when sending for real | type `mainnet` |
| `PULSECHAIN_MIRROR_SYNC`, `PULSECHAIN_ORDER_FILLER` | from step 1's summary |
| `ETHEREUM_MIRROR_REGISTRAR`, `ETHEREUM_ORDER_BOOK` | from step 2's summary |

It checks on Ethereum that the two Ethereum contracts are .hex's, and already linked to these two.
Then it links them from this side, in two transactions. That's for good: nobody can change it
afterwards. The summary ends "Linked. .hex is live on PulseChain Testnet v4 (or PulseChain) and its
Ethereum side."

Then [start the bot](../bot/README.md).

## Mainnet

- **The admin** is a wallet made just for it, with its own recovery phrase kept offline and used for
  nothing else ([how](../README.md#part-2-mainnet)): the same address in steps 1 and 2.
- **Not automated yet:** verifying the contracts on [scan.pulsechain.com](https://scan.pulsechain.com),
  which publishes their source code so anyone can check them. Sourcify, which the explorer reads,
  covers PulseChain.
