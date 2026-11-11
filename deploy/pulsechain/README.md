# Deploying on PulseChain

Names live on PulseChain, and one step puts .pdai there: the registry, the registrar and its
prices, the checkout, and the reserved names. New to this? [Start here](../README.md).

| | PulseChain Testnet v4 (the rehearsal) | PulseChain (for real) |
|---|---|---|
| Chain ID (the number wallets use to tell chains apart) | 943 | 369 |
| Coin | tPLS, free | PLS |
| RPC (the web address programs use to talk to the chain) | `https://rpc.v4.testnet.pulsechain.com` | `https://rpc.pulsechain.com` |
| Explorer (look up transactions and contracts) | [scan.v4.testnet.pulsechain.com](https://scan.v4.testnet.pulsechain.com) | [scan.pulsechain.com](https://scan.pulsechain.com) |
| Faucet (free test coins) | [faucet.v4.testnet.pulsechain.com](https://faucet.v4.testnet.pulsechain.com), 10 tPLS a request | |

To add the testnet to your wallet, open [chainlist.org/chain/943](https://chainlist.org/chain/943),
connect your wallet, and add the network from there.

## The deployer's PLS

- **Testnet:** 10 tPLS, one request at the faucet. The deploy costs well under 1 tPLS.
- **Mainnet:** have about 60,000 PLS. The deploy uses about 42 million gas, which would have cost
  about 20,000 PLS on 11 November 2026: the price of gas moves a lot, and the dry run shows the most
  it could cost on the day.

## Testnet: USDC from Sepolia

Names are priced in USDC (a dollar stablecoin), and whatever a buyer pays with is swapped into it.
On mainnet that's USDC bridged from Ethereum. On the testnet it's Circle's test USDC, bridged from
Sepolia (Ethereum's testnet), which the testnet bridge calls "USDC from Sepolia". The deploy only
needs it to exist on the testnet, and it does: HexNS's rehearsal bridged the first of it in November
2026. To buy names on the testnet copy of the site, bridge some to your own wallet:

1. **Get Sepolia ETH** for the bridge's gas. Faucets (sites that give out test coins) come and go.
   On 7 November 2026 these were up:
   [Google Cloud's faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia), with a
   Google account, and [sepolia-faucet.pk910.de](https://sepolia-faucet.pk910.de), which has your
   browser do some work for a few minutes instead.
2. **Get test USDC on Sepolia** at [faucet.circle.com](https://faucet.circle.com): choose Ethereum
   Sepolia and paste your wallet's address. (Its address is
   `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, if your wallet asks.)
3. **Bridge it** at [bridge.v4.testnet.pulsechain.com](https://bridge.v4.testnet.pulsechain.com):
   from Sepolia to PulseChain Testnet v4, token USDC, to your own wallet. Send about 30: a name
   costs 10; the rest is for a renewal.
4. **Wait about 15 to 20 minutes** for it to arrive. That's how long the testnet bridge took on
   7 November 2026. To see the token in your wallet, add the address the deploy's summary lists as
   `USDC` (a dry run shows it too).

On the testnet, pay for names in USDC, not tPLS. Paying in tPLS goes through PulseX (PulseChain's
exchange), and PulseX's testnet has no pool for USDC from Sepolia.

## Deploy on PulseChain

On GitHub: **Actions**, then **deploy**, then **Run workflow**.

| Field | Fill in |
|---|---|
| Network | Testnet, or Mainnet |
| Send it for real | unticked for the dry run, then ticked |
| Mainnet only, when sending for real | type `mainnet` |
| Admin wallet | the admin's address ([which wallet](../README.md#what-youll-need)) |
| Who receives payments | already filled in with your wallet, `0x1027…02C6`. Every payment for a name goes straight to it, and it can never be changed once deployed |

Before it sends anything, it runs the unit tests, then checks:

- that the admin, and the wallet of every reserved name given to someone, can hold a name;
- that neither the admin nor the wallet receiving payments is the deployer, whose key sits in GitHub;
- that USDC, DAI, WPLS and PulseX are where they should be.

Then it sends about 70 transactions: about 25 for the contracts and their settings, and one for each
reserved name. That takes about 10 minutes.

**What to copy from the summary** (open the finished run, scroll down):

| Line | Where it goes |
|---|---|
| the **For the website** block: `PDAI_REGISTRY`, `REGISTRAR`, `CHECKOUT`, `USDC`, `START_BLOCK` | into `web/src/deployment.ts` ([the website guide](../website/README.md)) |
| `Payments go to` | nowhere: check it's your wallet, `0x102785E63DCD7C2ba1146E96da7fE429155602C6`. The dry run shows it before anything is sent |
| `Price rules locked` | nowhere: check it says `yes, for good`. Nobody, you included, can then change the price of one length, the multi-year prices, which characters names can use, the 63-character limit or the 5-year limit |
| `Deployer roles left` | nowhere: check it says `none`. The deployer's key sits in GitHub, so it must keep no powers |
| `UniversalResolver` | for wallets that add .pdai: where they look names up |
| Root registry, Default resolver, Price oracle and the rest | nowhere: for reference |
| Reserved names given and held | a check against the list |

A real run also saves a full record of everything it sent: on the run's page, under **Artifacts**.

Then [put up the website](../website/README.md).

## Mainnet

- **The admin** is a wallet made just for it, with its own recovery phrase kept offline and used for
  nothing else ([how](../README.md#part-2-mainnet)).
- **Not automated yet:** verifying the contracts on [scan.pulsechain.com](https://scan.pulsechain.com),
  which publishes their source code so anyone can check them. Sourcify, which the explorer reads,
  covers PulseChain.
