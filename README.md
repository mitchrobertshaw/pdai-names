# hex-names

`.hex` names that work on both PulseChain and Ethereum, bought in a few clicks on PulseChain and
copied to Ethereum.

Built on [ENSv2](https://github.com/ensdomains/contracts-v2), the next version of the Ethereum Name
Service, at its audited commit. A `.hex` name lives on PulseChain and is copied to Ethereum
automatically, so one purchase covers both chains. Every name resolves to its owner's address on
PulseChain from the moment it is registered, and on Ethereum about 15 minutes later.

> **Status:** unaudited and not deployed. ENSv2 itself has been audited, but the small patch that
> runs it on PulseChain and the contracts in `src/` have not. Don't put real money through them
> until someone other than their author has reviewed them.

> **`.hex` names never end in `.eth`.** `alice.hex` and `alice.hex.eth` are different names. This
> project doesn't control `hex.eth`, so whoever does decides where `alice.hex.eth` points. When
> sending to someone's `.hex` name, type it exactly as `name.hex`.

## Is `.hex` free?

Yes, as of 5 November 2026. Checked on-chain: ENS on Ethereum has no `.hex` ending, Pulse Domains
on PulseChain has none (of the 1,163 endings it has created), nor does the copy of ENS PulseChain
inherited at its fork, Unstoppable Domains, or Decentraweb. `.hex` is not an internet domain ending,
and nobody applied for it in ICANN's 2026 round, so it cannot reach ENS through the DNS route
either.

## Buying a name

Names are bought on PulseChain: 2–3 clicks (approve if paying with a token, commit, register), and
the name is yours in about 1–2 minutes, on Ethereum about 15 minutes later. The app takes PLS, HEX,
eHEX (HEX bridged from Ethereum), PLSX, and USDC, USDT, DAI or WETH bridged from Ethereum (never the
copies of USDC, USDT, DAI or WETH made when PulseChain forked from Ethereum). The checkout contract
takes any token with a PulseX pool, but the app offers just these: holders of other tokens swap to
PLS on PulseX first. Adding one to the app needs no new contracts: it's an entry in
`web/src/lib/tokens.ts`, with the route PulseX swaps it along. Whatever the buyer pays with is swapped into USDC, so prices stay in
dollars without a price oracle. The app quotes each payment on both PulseX routers (V1 and V2) and
pays along whichever needs less: in November 2026, $640 of PLS cost 6.6% more on V2 than on V1.

1. **Commit.** The wallet commits to the name with a hash of its details. Nothing is paid yet, and
   nobody watching can see which name it is.
2. **Wait** one minute.
3. **Register** through `AnyTokenCheckout` with any token or PLS. It swaps to USDC on PulseX, pays the
   registrar exactly the price, returns the change, and sends the name to Ethereum. While Ethereum
   is busy, the buyer can also pay the copy fee, to have it copied there at once, or copy it there
   themselves in ETH (below).

### Coming from Ethereum or another chain

The app checks the buyer's wallet on PulseChain. If it doesn't hold enough, the app sends them to
[LibertySwap](https://libertyswap.finance), a separate service: they send USDC from Ethereum, Base,
Arbitrum or another chain, and choose PLS on PulseChain to receive. It takes a few minutes and costs
about 0.3%, sending at least $10. The PLS pays for the name and the network fee.

### Buying from Ethereum directly (switched off)

The contracts for it are deployed but unused: an order placed in `HexOrderBook` on Ethereum, filled
on PulseChain through `HexOrderFiller` by a bot paying from its own float, and settled over the
bridge, with a refund if it can't be filled. The website doesn't offer it, and the bot leaves it off
(`FILL=false`), so it needs no float for orders, and ignores any order placed on the contract
directly. A buyer who places one anyway can take the money back 6½ hours after ordering (`reclaim`
on Ethereum), or anyone can call `reportExpired` on PulseChain once the order's 30 minutes are up,
which sends a refund over the bridge. Turning it back on needs the website's Ethereum checkout and a
bot with `FILL=true` and a float.

### Why there's a bot

The official bridge carries every change to Ethereum, but someone has to claim each message on
Ethereum and pay its gas. The bot does that, and also sends renewals and transfers across. The bridge
waits until the sending chain has made a transaction irreversible, about 11 minutes on PulseChain.
Timed over its last 25 messages each way on 5 November 2026:

| Direction | Fastest | Typical | Slowest |
|---|---|---|---|
| Ethereum → PulseChain | 13.5 min | 17.4 min | 19.8 min |
| PulseChain → Ethereum (until it can be claimed) | 10.8 min | 13.3 min | 15.2 min |

The bot gets no special powers: it can only deliver what the bridge has signed.

So that nobody can run up its gas by changing a name over and over, the bot copies each name at most
once an hour (the newest change wins), and spends at most 0.02 ETH a day copying names, about 550
copies at November 2026's gas prices. The rest wait until the next day (UTC).

## How names work on both chains

- **Where names live.** Names live in an ENSv2 registry on PulseChain. That's where they're bought,
  renewed and transferred.
- **The Ethereum copy.** Every change is copied to an identical ENSv2 registry on Ethereum about 15
  minutes later, by bridge messages the bot claims on Ethereum. Copies on Ethereum can't be bought,
  renewed or transferred there; they follow PulseChain. A name renewed in its grace period is
  extended on Ethereum too, so its owner's Ethereum settings stay.
- **When Ethereum is busy.** Each copy costs the bot Ethereum's gas: a few cents in November 2026.
  The project pays up to $2 a copy. When a copy costs more, the bot sets a copy fee on the checkout:
  the rest, and a quarter more for gas rising before the copy goes out. Buyers and renewers choose
  between their copy going free once Ethereum's fees fall, or at once for the fee, in the same
  payment and in the same token. Sending a name through the app pays it too, so the new owner shows
  on Ethereum at once. Changes of owner made elsewhere, and names the admin hands out, are copied at
  once at the project's cost. The fee goes to the bot, which buys its ETH with it. Paying the bot to
  copy at once is offered while it holds the ETH to do it straight away: it keeps a little for that
  (`COPY_NOW_ETH`, 0.02 ETH, bought while Ethereum is cheap), enough up to about 7 to 10 gwei. The
  admin chooses the bot, and caps the fee as a safety limit ($1,000 at deploy).
- **Copying it yourself.** Busier than that, buyers and renewers choose between **Later, free** and
  **Myself, in ETH**: after paying, the bridge signs the copy (usually 10 to 15 minutes), and their
  wallet delivers it on Ethereum, paying Ethereum's fee in ETH, however busy Ethereum is. A name's
  page offers the same to anyone, for any copy that's waiting. Anyone may deliver a signed message:
  the bridge checks the validators' signatures, so it can only write what PulseChain says. The app
  shows Ethereum's fee first, and stops before the wallet is asked if it doesn't hold the ETH a
  copy needs on hand (Ethereum sets aside the whole million gas a copy may use, and gives back
  what it didn't). The bot keeps every copy it's holding back queued, looks at each again every
  five minutes, leaves any delivered meanwhile, and copies the rest free within a minute or so of
  fees falling. If two
  people copy a name in the same block, one copies it, and the other stops without copying; the app
  says so, rather than fail.
- **Addresses.** By default a name resolves to its owner's address, for Ethereum (coin type 60),
  PulseChain (ENSIP-11 coin type `0x80000171`) and any EVM chain's default (ENSIP-19). This is the
  `OwnerResolver` set on `.hex` itself.
- **Records.** Owners who want other records (other addresses, text, avatar, a website) point their
  name at their own ENSv2 resolver, on either chain.
- **Lookups.** Apps look names up through ENSv2's `UniversalResolverV2` on either chain, the same
  way they look up ENS names.

One caveat: a smart-contract wallet may not control the same address on the other chain. Owners
using one should set their own resolver. The same goes for wallets with an EIP-7702 delegation that
can't hold ERC-1155 tokens: their Ethereum copy is skipped, but the name still works on PulseChain.

## Prices

| Length | 1 year | 2 years | 3 years | 4 years | 5 years |
|---|---|---|---|---|---|
| 5 to 63 characters | $10 | $15 | $17.50 | $18.75 | $20 |
| 4 | $160 | $240 | $280 | $300 | $320 |
| 3 | $320 | $480 | $560 | $600 | $640 |
| 1–2 | not for sale | | | | |
| 64 or more | too long | | | | |

Each covers the name on both chains.

- **5 years for the price of 2.** Each extra year costs less than the one before: 2 years cost 1.5
  years' price, 3 cost 1.75, 4 cost 1.875 and 5 cost 2. Renewals are priced the same way.
- **Up to 5 years ahead.** A name can be bought for at most 5 years, and renewed only as far as 5
  years from today. Its owner can always renew it back up to 5 years.
- **Plain names: letters a to z, numbers and hyphens.** No capitals, spaces, symbols, emoji or
  letters from other alphabets, so every name is one wallets look up exactly as written, and nobody
  can register a look-alike of a name (such as "RichardHeart", or alice with a Cyrillic "а"), even
  by going around the app. As in ENS's rules, a name can't have hyphens as both its 3rd and 4th
  characters.
- **Up to 63 characters**, the most one part of a web address can hold, so every `.hex` name can
  also work as one.
- [`HexNameRules`](src/pulsechain/HexNameRules.sol) sits in front of the prices and keeps these
  rules. It never refuses a renewal, whatever the name.
- **Expired names.** A name that expires has a 28-day grace period for its owner to renew. After
  that it can be bought again, starting at a $100 million premium that halves every day for 21 days,
  so nobody can snipe a name the moment it lapses.
- **Payment.** Whatever the buyer pays with ([buying a name](#buying-a-name)), the checkout turns it
  into USDC, and the registrar sends it straight to the beneficiary set at deployment, which can
  never change (the deploy workflow fills in the project owner's wallet). The registrar itself takes
  only USDC or DAI bridged from Ethereum.

## Reserved names

Some names are set aside when .hex is deployed, before anyone can buy names. They're listed in
[`script/reserved-names.csv`](script/reserved-names.csv), one per row: the name, optionally a
wallet, and a note.

- **With a wallet**, the name belongs to that wallet from the start, as if they had bought it. Only
  use a wallet you're sure is theirs, such as the one their own `.eth` or `.pls` name points to.
- **Without a wallet**, the name is held. Nobody can buy it and it points nowhere, until its owner
  proves who they are and the admin hands it to their wallet.

Either way it lasts 5 years from deployment. After that a given name is renewed like any other, and
a held name nobody claimed goes on sale. The admin can extend either. Given names reach the Ethereum
copy on the bot's first run, as long as its `START_BLOCK_PULSECHAIN` is the block step 1 was
deployed in.

**Adding names.** Edit the file on GitHub before deploying (open it, then the pencil icon). One name
per row, without `.hex`: a–z, 0–9 and hyphens, 3 to 63 characters. Leave the wallet empty to hold
a name, and keep commas out of the note. The tests and the deploy check every row and stop at the
first one that's wrong.

**Handing over a held name.** Once you're sure who it belongs to (for example, they sign a message
with the wallet their `.eth` or `.pls` name points to), the admin calls `register` on the .hex
registry with:

| Field | Value |
|---|---|
| `label` | the name, e.g. `pulsechain` |
| `owner` | their wallet |
| `registry` | `0x0000000000000000000000000000000000000000` |
| `resolver` | `0x0000000000000000000000000000000000000000` (the default: it points to its owner) |
| `roleBitmap` | `97409655027181761882228017414928043058140282880` (the rights a buyer gets) |
| `expiry` | `0` (keeps the reservation's expiry) |

This works only on held names, never on a name someone owns. A page that does it for you can come
with the website.

## Who can do what

**Nobody can** unregister, move, or redirect someone's live name on PulseChain. That includes the
admin and the deployer. The registry has no role that can, and the tests check it. Nobody can
replace the `.hex` registry or its default resolver on either chain: `.hex` is registered in each
root with no roles at all.

**The admin** (PulseChain only) can:

- raise or lower all prices together: it looks after the price oracle's payment tokens, so it can
  add or remove one and set its exchange rate (which scales every price), or stop sales;
- add or remove registrars and renewers on the `.hex` registry. A registrar it adds could register a
  name that has expired, even one still in its 28-day grace period, and removing the official
  registrar's renew role would stop renewals;
- hand held reserved names to their owners;
- restyle the name cards wallets and marketplaces show (cosmetic: it changes no name or owner).
  On Ethereum nobody can;
- add new endings to the root registry;
- choose the bot that sets the Ethereum copy fee, and cap the fee or switch it off. The fee is only
  ever paid by those who choose to pay it.

It can't unregister a live name, change a name's resolver, or move a name. Nor can it change the
price of one length, the multi-year prices, the premium for expired names, which characters names
can use, the 63-character limit or the 5-year limit: the registrar is deployed with them and gives
up the one power that could swap them (`setRentPriceOracle`), so nobody can, and the tests check
it. It can give up each of its powers, handing out reserved names included. Keep the admin in a
wallet used for nothing else, with its recovery phrase offline, or give these powers up once things
are settled.

The app's admin page, `app.hexns.domains/admin` (not in the menu), makes the everyday ones easy from
the admin wallet: pause and restart sales (renewals carry on), raise or lower all prices together,
hold names, hand them to their owners and add time to them, and run the copy fee. It opens only for a wallet with
admin powers, and doesn't say which wallet that is ([how](deploy/website/README.md#the-admin-page)). (A multisig such as a Safe would be stronger, but Safe's own app doesn't support
PulseChain.)

**The bridge's validators** (5 of 8 must sign) are trusted for two things: the Ethereum copy, and
releasing money held by Ethereum orders (only if those are switched on). If they were compromised
they could write a false Ethereum copy, or redirect money held by open orders. They could never
touch the real names on PulseChain. Every token bridged to PulseChain relies on the same validators.

**The bot** affects only how soon Ethereum's copy is current. A stolen bot key loses only the bot's
own gas and working balance, and what's left of the budget the payments wallet allows it. It could
also set the copy fee as high as the admin's cap and receive what people chose to pay, until the
admin chooses another bot or switches the fee off. If the bot stops, names still work on PulseChain,
and Ethereum's copy catches up when it's back.

**Nothing else has an owner.** `AnyTokenCheckout`'s owner, the admin, runs only the copy fee: it
can't touch names, prices or what the registrar is paid, and a purchase never fails over the fee.
`HexOrderFiller`, `HexMirrorSync`, `HexOrderBook`, `HexMirrorRegistrar` and `HexNameCard` have no
admin functions. None of them can be upgraded or paused. Each
bridge contract is linked once, by the deployer, to its partner on the other chain. After that,
nothing can change.

## The contracts

| PulseChain | What it is |
|---|---|
| ENSv2 `PermissionedRegistry` ×2 | the root registry, and the `.hex` registry where names live |
| ENSv2 `ETHRegistrar` + `StandardRentPriceOracle` | the `.hex` registrar and its prices |
| [`HexNameRules`](src/pulsechain/HexNameRules.sol) | between the registrar and its prices: new names are plain (a-z, 0-9 and hyphens), up to 63 characters, paid for up to 5 years ahead |
| ENSv2 `UniversalResolverV2`, `PermissionedResolver`, `VerifiableFactory`, `LabelStore`, `ContractNamer` | lookups, owners' own resolvers, and supporting contracts |
| [`SafeVerifiableFactory`](src/common/SafeVerifiableFactory.sol) | deploys `VerifiableFactory` so nobody can take over the logic owners' own resolvers share (see below) |
| [`OwnerResolver`](src/common/OwnerResolver.sol) | the default resolver: a name resolves to its owner |
| [`HexNameCard`](src/common/HexNameCard.sol) | each name's card: what wallets and NFT marketplaces show for it (see below) |
| [`AnyTokenCheckout`](src/pulsechain/AnyTokenCheckout.sol) | buy or renew with any token or PLS, as for .pdai, with the Ethereum copy fee while Ethereum is busy |
| [`HexOrderFiller`](src/pulsechain/HexOrderFiller.sol) | completes Ethereum orders and tells Ethereum over the bridge |
| [`HexMirrorSync`](src/pulsechain/HexMirrorSync.sol) | sends a name's owner and expiry to Ethereum over the bridge |

| Ethereum | What it is |
|---|---|
| the same ENSv2 contracts | the Ethereum copy of `.hex` and its lookups |
| [`HexMirrorRegistrar`](src/ethereum/HexMirrorRegistrar.sol) | the only writer of the Ethereum copy, from bridge messages |
| [`HexOrderBook`](src/ethereum/HexOrderBook.sol) | orders from Ethereum, and the money held for them |
| [`HexNameCard`](src/common/HexNameCard.sol) | the copies' cards, which say where each name lives |

**Name cards and selling.** As with .eth names, there's no HexNS marketplace: each name is an NFT
(ERC-1155) in the `.hex` registry, so owners sell names on PulseChain NFT marketplaces, and a name's
page in the app explains how. What wallets and marketplaces show for a name comes from the registry
itself, as ENS's metadata service does it for .eth names: [`HexNameCard`](src/common/HexNameCard.sol)
makes each name's card on-chain, so nothing has to stay online. The card has the name on the HexNS
gradient, sized to fit whichever common font a wallet draws it in (grey once expired), and the details
give its length, when it's paid until, whether it has expired, and a link to its page in the app. The
Ethereum copy's cards say it's a copy, which can't be sold: it follows the name on PulseChain.

**Running ENSv2 on PulseChain.** PulseChain lacks the opcodes from Ethereum's March 2024 upgrade
(`TSTORE`, `MCOPY`). So everything is compiled for the previous target, Shanghai, with the compiler
and settings ENS deploys with (solc 0.8.25, 1,000 optimizer runs). Two changes make that work, and
the same bytecode then runs on both chains:

- ENSv2 swaps the ENS library's memory copy for an `mcopy` version. Here the library's own
  word-by-word copy is used instead.
- One function in `PermissionedResolver` used `mcopy` directly. The patch replaces it with that same
  library copy, a few lines: [`patches/ensv2-shanghai.patch`](patches/ensv2-shanghai.patch).

The compiled contracts were scanned and contain none of the missing opcodes.

PulseChain also lacks that upgrade's limit on `SELFDESTRUCT` (EIP-6780). Every resolver that ENSv2's
`VerifiableFactory` makes for an owner forwards to one shared logic contract. Left as it comes,
anyone could set that contract up with their own code, destroy it on PulseChain, and break every
owner's resolver for good. So the factory is deployed through
[`SafeVerifiableFactory`](src/common/SafeVerifiableFactory.sol), which sets the shared contract up
in the same transaction with an implementation that does nothing, so nobody can take it over. The
tests check it.

## Running the tests

Nothing needs installing on your own computer: GitHub runs everything on every push (Actions tab,
workflow **test**).

- **Unit tests** (`test/unit/`): 121 tests that run both chains side by side, with the real ENSv2
  contracts and a stand-in bridge. They cover:
  - prices and roles, plain names, the 63-character and 5-year limits, that nobody can swap the
    price rules or unregister, move or redirect a live name, and that the admin can give up every
    power;
  - that nobody can take over the logic owners' own resolvers share;
  - reserved names, given or held, handing a held one over, and the list file;
  - buying with every kind of payment;
  - the whole Ethereum order flow, and every way it can be refunded;
  - that a buyer can never get both the name and a refund, and that a filler can't claim the wrong
    order;
  - the Ethereum copy following transfers, renewals and expiry, and keeping its owner's settings
    when a name is renewed in its grace period;
  - forged and out-of-order bridge messages;
  - the name cards: what they show, that any name fits on its card and none can break it, and who can
    restyle them.
- **Fork tests** (`test/fork/`): 10 tests against live copies of PulseChain and Ethereum. They use the
  real bridge contracts, PulseX, Uniswap, USDC, DAI, PLS, ETH and HEX on both chains.
- **Bot tests** (`bot/test/`): 47 tests, including hashes checked against the deployed contracts, a
  real bridge message, each network's settings, how it pays its own gas, and its limits on copying
  names.

With [Foundry](https://getfoundry.sh) and git:

```bash
./install-deps.sh
```

```bash
forge test
```

## Deploying without installing anything

**The guide is in [`deploy/`](deploy/README.md)**: what GitHub, Railway and Netlify each do, what
you do, and a page for each chain, the bot and the website. All of it happens in a browser. In
short: three steps, run from the GitHub website (a phone works too), first on the testnets
(PulseChain Testnet v4 and Sepolia), then on mainnet.

1. **Deploy on PulseChain** ([`script/pulsechain/`](script/pulsechain)): the `.hex` registry,
   registrar and checkout, the bridge contracts, and the [reserved names](#reserved-names).
2. **Deploy on Ethereum and link it** ([`script/ethereum/`](script/ethereum)): the Ethereum copy of
   `.hex`, and the order book for buying from Ethereum (switched off).
3. **Link PulseChain** ([`script/pulsechain/`](script/pulsechain)): after this, nothing can change
   the links. Run it straight after steps 1 and 2: until then, the deployer's key can still link the
   bridge contracts.

Each runs from Actions > deploy > Run workflow, as a dry run first. A new wallet, just for
deploying, pays for them: about 10 tPLS and 0.01 Sepolia ETH from faucets on the testnets, and about
50,000 PLS and 0.02 ETH on mainnet. Its key goes in a GitHub repository secret, one per network
(`DEPLOYER_PRIVATE_KEY_TESTNET`, `DEPLOYER_PRIVATE_KEY_MAINNET`), and it has no powers left once the
three steps are done. A real mainnet run also needs `mainnet` typed into the workflow's confirm box.
The admin must be a plain wallet, never upgraded to a smart account, since it is given the (powerless)
`hex` token. Each step checks the other chain's contracts before linking to them, and refuses if
something doesn't match.

## Running the bot

The bot in [`bot/`](bot) claims bridge messages on Ethereum, copies name changes to Ethereum, and
pays its own gas. It needs to run all the time. It runs on
[Railway](https://railway.com), set up in a browser, with a `testnet` environment for the rehearsal
and `production` for mainnet. Step by step: [the bot, on Railway](deploy/bot/README.md).

1. Give it a wallet with a little PLS on PulseChain and ETH on Ethereum, for gas (a few cents a
   claim at today's gas prices). That's the only funding it needs.
2. Paste its settings into Railway: `NETWORK`, its private key (sealed), and the **For the bot**
   lines from the deploy run summaries. Its order encryption key, only used if buying from Ethereum
   is switched on (`FILL=true`), is made from its wallet key, and it prints the public key when it
   starts.
3. Give it a Railway volume, where it remembers its place between restarts.
4. Let it draw from the payments wallet, up to a budget, on the app's payments page
   (app.hexns.domains/referrals, titled "Referral payouts").
5. Choose it as the copy bot on the app's admin page, which turns the Ethereum copy fee on.

It runs on autopilot. It keeps a small working balance of USDC ($20), buys PLS and ETH with it when
they run low, and tops the balance up from the payments wallet, within the budget. So its gas comes
out of revenue, and nobody tops it up by hand: [money](deploy/bot/README.md#money).

`npm run check-claim` checks the bot can claim real bridge messages. It finds one on the live bridge
that has been signed but not yet claimed, and simulates claiming it. Nothing is sent.

## For websites

- **On PulseChain:**
  1. Get the price with `AnyTokenCheckout.quoteRegister`, on each PulseX router (V1 and V2), and use
     whichever needs less. `quoteRegisterAndCopy` adds the copy fee, while there is one.
  2. Commit with `registrar.commit(registrar.makeCommitment(...))`.
  3. After a minute, call `registerWithToken` or `registerWithPLS` with a 2% buffer. To pay the copy
     fee too, call `registerWithTokenAndCopy` or `registerWithPLSAndCopy` with the most the buyer
     agreed to pay for it: if the fee has risen above that, the name is bought without it and copied
     free later. `payCopyFee` pays it on its own, after sending a name, say.
- **On Ethereum** (only with a bot that fills orders, `FILL=true`; the official site and bot don't):
  1. Call `prepareOrder` from [`bot/src/buy.ts`](bot/src/buy.ts) with the bot's public key.
  2. Read the price from the PulseChain registrar.
  3. Call `HexOrderBook.placeOrder` (or `placeOrderWithETH` or `placeOrderWithToken`) for the price
     plus the bot's fee (25 cents by default).
- **Looking names up:** call `UniversalResolverV2.resolve` on either chain, for example with viem's
  `getEnsAddress` and the deployment's `universalResolverAddress`.
- **Names must be in ENS normal form** (lower case, ENSIP-15). `prepareOrder` and the bot refuse
  anything else.
- **Say that `.hex` names never end in `.eth`** wherever people type a name.

## Not done yet

- Paying referrers automatically. Purchases and renewals made through a referral link record the
  referrer on-chain ([`web/README.md`](web/README.md#the-app)), and during the launch offer, the
  first 58 days after launch, referrers earn 10% of what the buyers they bring pay. The app's report
  at app.hexns.domains/referrals, for the payments wallet only, pays them all in one transaction when
  you press Pay all. It doesn't pay by itself.
- Phone wallets by QR code (WalletConnect) in the app at app.hexns.domains. Browser wallets work.
- Primary names (showing `alice.hex` for an address). Names themselves are managed on PulseChain
  only, where anyone can renew any name, and Ethereum's copy follows.
- Wallet support: wallets look up ENS out of the box but need adding `.hex`, for example as a
  MetaMask Snap. What to have ready, and who to ask: [docs/WALLET_CHECKLIST.md](docs/WALLET_CHECKLIST.md).
- Verifying the contracts on the block explorers (publishing their source code) from the deploy
  workflow.
- A button in the app to take back an Ethereum order, should anyone place one on the contract
  directly. The bot ignores such orders while buying from Ethereum is switched off; the buyer can
  `reclaim` it 6½ hours after ordering, or anyone can call `reportExpired` on PulseChain once its 30
  minutes are up ([how](#buying-from-ethereum-directly-switched-off)).
- A review by someone other than the author.

## License

MIT. See [LICENSE](LICENSE).
