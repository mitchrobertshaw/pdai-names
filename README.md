# pdai-names

`.pdai` names on PulseChain, bought in a few clicks with pDAI, PLS or most tokens on PulseX.

Built on [ENSv2](https://github.com/ensdomains/contracts-v2), the next version of the Ethereum Name
Service, at its audited commit. It's [HexNS](https://github.com/mitchrobertshaw/hex-names) made for
one chain: the same contracts and app as `.hex` names, without the copy on Ethereum, the bridge
contracts and the bot that kept it. A `.pdai` name lives on PulseChain and resolves to its owner's
address there from the moment it is registered.

> **Status:** unaudited and not deployed. ENSv2 itself has been audited, but the small patch that
> runs it on PulseChain and the contracts in `src/` have not. Don't put real money through them
> until someone other than their author has reviewed them.

> **`.pdai` names never end in `.eth`.** `alice.pdai` and `alice.pdai.eth` are different names.
> Nobody had registered `pdai.eth` on 11 November 2026; whoever does will decide where
> `alice.pdai.eth` points. When sending to someone's `.pdai` name, type it exactly as `name.pdai`.

## Is `.pdai` free?

Yes, as of 11 November 2026. Checked on-chain:

- **Pulse Domains** on PulseChain has no `.pdai` ending. It has created 1,163 endings, all on 20
  January 2024 (`.pls`, `.reverse` and 1,161 internet domain endings), and none since. Only a
  controller of its Root contract (`0xC5420D626834D38e2Dc3667a9C901218F8f39dce`) can create one. Its
  owner, a single wallet, removed both controllers on 3 November 2026, but could add one at any time:
  watch the Root contract for a `ControllerChanged` event.
- **ENS on Ethereum**, and the copy of ENS PulseChain inherited at its fork, have no `.pdai` ending.
- **Unstoppable Domains** doesn't offer `.pdai`. **Decentraweb** doesn't have it either, but sells
  endings to anyone, on Ethereum and Polygon, so someone could still buy it there.
- `.pdai` is not an internet domain ending, and nobody applied for it in ICANN's 2026 round.

Names close to it that others hold: `pdai.pls` on Pulse Domains is registered until 24 June 2027.
`pdai.eth` on ENS was free.

## Buying a name

Names are bought on PulseChain: 2–3 clicks (approve if paying with a token, commit, register), and
the name is yours in about 1–2 minutes. The app takes pDAI, PLS, HEX, eHEX (HEX bridged from
Ethereum), PLSX, and USDC, USDT, DAI or WETH bridged from Ethereum (never the copies of USDC, USDT or
WETH made when PulseChain forked from Ethereum). The checkout contract takes any token with a PulseX
pool, but the app offers just these: holders of other tokens swap to PLS on PulseX first. Adding one
to the app needs no new contracts: it's an entry in `web/src/lib/tokens.ts`, with the route PulseX
swaps it along. Whatever the buyer pays with is swapped into USDC, so prices stay in dollars without
a price oracle. The app quotes each payment on both PulseX routers (V1 and V2) and pays along
whichever needs less: in November 2026, $640 of PLS cost 6.6% more on V2 than on V1.

**Paying with pDAI.** pDAI, the copy of DAI made when PulseChain forked, is paid at its own price on
PulseX, a fraction of a dollar: the registrar never takes it as a dollar. It goes through WPLS, whose
pools with pDAI are PulseX's deepest for it (about 182 million pDAI on V2 and 18 million on V1 on 11
November 2026; its pools with USDC held under $250). That day $10 took about 9,250 pDAI on either
router, about 0.4% over its market price, and $640 about 612,800 pDAI on V1, about 4% over.

1. **Commit.** The wallet commits to the name with a hash of its details. Nothing is paid yet, and
   nobody watching can see which name it is.
2. **Wait** one minute.
3. **Register** through `AnyTokenCheckout` with any token or PLS. It swaps to USDC on PulseX, pays
   the registrar exactly the price, and returns the change.

### Coming from Ethereum or another chain

The app checks the buyer's wallet on PulseChain. If it doesn't hold enough, the app sends them to
[LibertySwap](https://libertyswap.finance), a separate service: they send USDC from Ethereum, Base,
Arbitrum or another chain, and choose PLS on PulseChain to receive. It takes a few minutes and costs
about 0.3%, sending at least $10. The PLS pays for the name and the network fee.

## How names work

- **Where names live.** Names live in an ENSv2 registry on PulseChain. That's where they're bought,
  renewed and transferred, and every change takes effect straight away. Nothing is copied to any
  other chain.
- **Addresses.** By default a name resolves to its owner's address, for coin type 60 (what wallets
  ask for by default, named for Ethereum but how EVM wallets on PulseChain ask too), PulseChain's own
  (ENSIP-11 coin type `0x80000171`) and any EVM chain's default (ENSIP-19). This is the
  `OwnerResolver` set on `.pdai` itself.
- **Records.** Owners who want other records (other addresses, text, avatar, a website) point their
  name at their own ENSv2 resolver.
- **Lookups.** Apps look names up through ENSv2's `UniversalResolverV2` on PulseChain, the same way
  they look up ENS names.

One caveat: a smart-contract wallet may not control the same address on other chains. Owners using
one should set their own resolver, so the name only answers for the chains they mean.

## Prices

| Length | 1 year | 2 years | 3 years | 4 years | 5 years |
|---|---|---|---|---|---|
| 5 to 63 characters | $10 | $15 | $17.50 | $18.75 | $20 |
| 4 | $160 | $240 | $280 | $300 | $320 |
| 3 | $320 | $480 | $560 | $600 | $640 |
| 1–2 | not for sale | | | | |
| 64 or more | too long | | | | |

The same prices as `.hex` names on HexNS.

- **5 years for the price of 2.** Each extra year costs less than the one before: 2 years cost 1.5
  years' price, 3 cost 1.75, 4 cost 1.875 and 5 cost 2. Renewals are priced the same way.
- **Up to 5 years ahead.** A name can be bought for at most 5 years, and renewed only as far as 5
  years from today. Its owner can always renew it back up to 5 years.
- **Plain names: letters a to z, numbers and hyphens.** No capitals, spaces, symbols, emoji or
  letters from other alphabets, so every name is one wallets look up exactly as written, and nobody
  can register a look-alike of a name (such as "RichardHeart", or alice with a Cyrillic "а"), even
  by going around the app. As in ENS's rules, a name can't have hyphens as both its 3rd and 4th
  characters.
- **Up to 63 characters**, the most one part of a web address can hold, so every `.pdai` name can
  also work as one.
- [`PdaiNameRules`](src/PdaiNameRules.sol) sits in front of the prices and keeps these rules. It
  never refuses a renewal, whatever the name.
- **Expired names.** A name that expires has a 28-day grace period for its owner to renew. After
  that it can be bought again, starting at a $100 million premium that halves every day for 21 days,
  so nobody can snipe a name the moment it lapses.
- **Payment.** Whatever the buyer pays with ([buying a name](#buying-a-name)), the checkout turns it
  into USDC, and the registrar sends it straight to the beneficiary set at deployment, which can
  never change (the deploy workflow fills in the project owner's wallet). The registrar itself takes
  only USDC or DAI bridged from Ethereum.

To change the prices before deploying, change `YEARLY_PRICE_3`, `YEARLY_PRICE_4` and
`YEARLY_PRICE_5_PLUS` in [`script/PdaiDeployer.sol`](script/PdaiDeployer.sol) and `PRICES` in
[`web/src/lib/names.ts`](web/src/lib/names.ts) together: a test checks they match. After deploying,
the admin can only raise or lower all prices together.

## Reserved names

Some names are set aside when .pdai is deployed, before anyone can buy names. They're listed in
[`script/reserved-names.csv`](script/reserved-names.csv), one per row: the name, optionally a
wallet, and a note. The list starts as HexNS's.

- **With a wallet**, the name belongs to that wallet from the start, as if they had bought it. Only
  use a wallet you're sure is theirs, such as the one their own `.eth` or `.pls` name points to.
- **Without a wallet**, the name is held. Nobody can buy it and it points nowhere, until its owner
  proves who they are and the admin hands it to their wallet.

Either way it lasts 5 years from deployment. After that a given name is renewed like any other, and
a held name nobody claimed goes on sale. The admin can extend either.

**Adding names.** Edit the file on GitHub before deploying (open it, then the pencil icon). One name
per row, without `.pdai`: a–z, 0–9 and hyphens, 3 to 63 characters. Leave the wallet empty to hold
a name, and keep commas out of the note. The tests and the deploy check every row and stop at the
first one that's wrong.

**Handing over a held name.** Once you're sure who it belongs to (for example, they sign a message
with the wallet their `.eth` or `.pls` name points to), the admin calls `register` on the .pdai
registry with:

| Field | Value |
|---|---|
| `label` | the name, e.g. `pulsechain` |
| `owner` | their wallet |
| `registry` | `0x0000000000000000000000000000000000000000` |
| `resolver` | `0x0000000000000000000000000000000000000000` (the default: it points to its owner) |
| `roleBitmap` | `97409655027181761882228017414928043058140282880` (the rights a buyer gets) |
| `expiry` | `0` (keeps the reservation's expiry) |

This works only on held names, never on a name someone owns. The app's admin page does it for you
([below](#who-can-do-what)).

## Who can do what

**Nobody can** unregister, move, or redirect someone's live name. That includes the admin and the
deployer. The registry has no role that can, and the tests check it. Nobody can replace the `.pdai`
registry or its default resolver: `.pdai` is registered in the root with no roles at all.

**The admin** can:

- raise or lower all prices together: it looks after the price oracle's payment tokens, so it can
  add or remove one and set its exchange rate (which scales every price), or stop sales;
- add or remove registrars and renewers on the `.pdai` registry. A registrar it adds could register
  a name that has expired, even one still in its 28-day grace period, and removing the official
  registrar's renew role would stop renewals;
- hand held reserved names to their owners;
- restyle the name cards wallets and marketplaces show (cosmetic: it changes no name or owner);
- add new endings to the root registry.

It can't unregister a live name, change a name's resolver, or move a name. Nor can it change the
price of one length, the multi-year prices, the premium for expired names, which characters names
can use, the 63-character limit or the 5-year limit: the registrar is deployed with them and gives
up the one power that could swap them (`setRentPriceOracle`), so nobody can, and the tests check
it. It can give up each of its powers, handing out reserved names included. Keep the admin in a
wallet used for nothing else, with its recovery phrase offline, or give these powers up once things
are settled.

The app's admin page, `app.pdai.domains/admin` (not in the menu), makes the everyday ones easy
from the admin wallet: pause and restart sales (renewals carry on), raise or lower all prices
together, and hold names, hand them to their owners and add time to them. It opens only for a wallet
with admin powers, and doesn't say which wallet that is
([how](deploy/website/README.md#the-admin-page)). (A multisig such as a Safe would be stronger, but
Safe's own app doesn't support PulseChain.)

**Nothing else has an owner.** `AnyTokenCheckout` and `PdaiNameCard` have no admin functions, and
the registrar gave up its only one. None of them can be upgraded or paused.

## The contracts

All on PulseChain.

| Contract | What it is |
|---|---|
| ENSv2 `PermissionedRegistry` ×2 | the root registry, and the `.pdai` registry where names live |
| ENSv2 `ETHRegistrar` + `StandardRentPriceOracle` | the `.pdai` registrar and its prices |
| [`PdaiNameRules`](src/PdaiNameRules.sol) | between the registrar and its prices: new names are plain (a-z, 0-9 and hyphens), up to 63 characters, paid for up to 5 years ahead |
| ENSv2 `UniversalResolverV2`, `PermissionedResolver`, `VerifiableFactory`, `LabelStore`, `ContractNamer` | lookups, owners' own resolvers, and supporting contracts |
| [`SafeVerifiableFactory`](src/SafeVerifiableFactory.sol) | deploys `VerifiableFactory` so nobody can take over the logic owners' own resolvers share (see below) |
| [`OwnerResolver`](src/OwnerResolver.sol) | the default resolver: a name resolves to its owner |
| [`PdaiNameCard`](src/PdaiNameCard.sol) | each name's card: what wallets and NFT marketplaces show for it (see below) |
| [`AnyTokenCheckout`](src/AnyTokenCheckout.sol) | buy or renew with any token or PLS, pDAI included |

**Name cards and selling.** As with .eth names, there's no pDAI Names marketplace: each name is an
NFT (ERC-1155) in the `.pdai` registry, so owners sell names on PulseChain NFT marketplaces, and a
name's page in the app explains how. What wallets and marketplaces show for a name comes from the
registry itself, as ENS's metadata service does it for .eth names:
[`PdaiNameCard`](src/PdaiNameCard.sol) makes each name's card on-chain, so nothing has to stay
online. The card has the name in white on pDAI Name Service's navy, under the mark in pDAI's
colours, with Dai's two lines along its foot (all grey once expired), sized to fit whichever common
font a wallet draws it in, and the details give its length, when it's paid until, whether it has
expired, and a link to its page in the app.

**Running ENSv2 on PulseChain.** PulseChain lacks the opcodes from Ethereum's March 2024 upgrade
(`TSTORE`, `MCOPY`). So everything is compiled for the previous target, Shanghai, with the compiler
and settings ENS deploys with (solc 0.8.25, 1,000 optimizer runs). Two changes make that work:

- ENSv2 swaps the ENS library's memory copy for an `mcopy` version. Here the library's own
  word-by-word copy is used instead.
- One function in `PermissionedResolver` used `mcopy` directly. The patch replaces it with that same
  library copy, a few lines: [`patches/ensv2-shanghai.patch`](patches/ensv2-shanghai.patch).

The compiled contracts were scanned and contain none of the missing opcodes.

PulseChain also lacks that upgrade's limit on `SELFDESTRUCT` (EIP-6780). Every resolver that ENSv2's
`VerifiableFactory` makes for an owner forwards to one shared logic contract. Left as it comes,
anyone could set that contract up with their own code, destroy it on PulseChain, and break every
owner's resolver for good. So the factory is deployed through
[`SafeVerifiableFactory`](src/SafeVerifiableFactory.sol), which sets the shared contract up in the
same transaction with an implementation that does nothing, so nobody can take it over. The tests
check it.

## Running the tests

Nothing needs installing on your own computer: GitHub runs everything on every push (Actions tab,
workflow **test**).

- **Unit tests** (`test/unit/`): 80 tests, with the real ENSv2 contracts. They cover:
  - prices and roles, plain names, the 63-character and 5-year limits, that nobody can swap the
    price rules or unregister, move or redirect a live name, that the checkout has no owner, and
    that the admin can give up every power;
  - that nobody can take over the logic owners' own resolvers share;
  - reserved names, given or held, handing a held one over, and the list file;
  - buying and renewing with every kind of payment, and that the checkout never keeps a thing;
  - lookups: straight away, after a transfer, after expiry, and with an owner's own resolver;
  - the name cards: what they show, that any name fits on its card and none can break it, and who can
    restyle them.
- **Fork tests** (`test/fork/`): 9 tests against a live copy of PulseChain, with the real PulseX,
  USDC, DAI, PLS, HEX and pDAI: buying with each token the app offers, on the router it quotes, and
  renewing with pDAI.
- **Website tests** (`web/`): 88 tests, including that the site's prices, name rules, tokens and
  routes match the contracts and `script/Addresses.sol`, and that the mark is the same shape on the
  site, in the brand files and on the name cards.

With [Foundry](https://getfoundry.sh) and git:

```bash
./install-deps.sh
```

```bash
forge test
```

## Deploying without installing anything

**The guide is in [`deploy/`](deploy/README.md)**: what GitHub and Netlify each do, what you do,
and a page for the deploy and for the website. All of it happens in a browser. In short: one step,
run from the GitHub website (a phone works too), first on the testnet (PulseChain Testnet v4), then
on mainnet.

It runs from Actions > deploy > Run workflow, as a dry run first, and deploys everything: the
`.pdai` registry, registrar and checkout, and the [reserved names](#reserved-names). A new wallet,
just for deploying, pays for it: about 10 tPLS from the faucet on the testnet, and up to 60,000 PLS
on mainnet. Its key goes in a GitHub repository secret, one per network
(`DEPLOYER_PRIVATE_KEY_TESTNET`, `DEPLOYER_PRIVATE_KEY_MAINNET`), and it has no powers left once the
deploy is done: its summary checks that. A real mainnet run also needs `mainnet` typed into the
workflow's confirm box. The admin must be a plain wallet, never upgraded to a smart account, since
it is given the (powerless) `pdai` token.

## For websites

1. Get the price with `AnyTokenCheckout.quoteRegister`, on each PulseX router (V1 and V2), and use
   whichever needs less. `quoteRenew` does the same for a renewal.
2. Commit with `registrar.commit(registrar.makeCommitment(...))`.
3. After a minute, call `registerWithToken` or `registerWithPLS` with a 2% buffer.

- **Looking names up:** call `UniversalResolverV2.resolve` on PulseChain, for example with viem's
  `getEnsAddress` and the deployment's `universalResolverAddress`.
- **Names must be in ENS normal form** (lower case, ENSIP-15).
- **Say that `.pdai` names never end in `.eth`** wherever people type a name.

## Not done yet

- Paying referrers automatically. Purchases and renewals made through a referral link record the
  referrer on-chain ([`web/README.md`](web/README.md#the-app)), and during the launch offer, the
  first 58 days after launch, referrers earn 10% of what the buyers they bring pay. The app's report
  at app.pdai.domains/referrals, for the payments wallet only, pays them all in one transaction
  when you press Pay all. It doesn't pay by itself.
- Phone wallets by QR code (WalletConnect) in the app at app.pdai.domains. Browser wallets work.
- Primary names (showing `alice.pdai` for an address).
- Wallet support: wallets look up ENS out of the box but need adding `.pdai`, for example as a
  MetaMask Snap. What to have ready, and who to ask: [docs/WALLET_CHECKLIST.md](docs/WALLET_CHECKLIST.md).
- Verifying the contracts on the block explorer (publishing their source code) from the deploy
  workflow.
- The domain. The site, the app and the name cards expect `pdai.domains` and `app.pdai.domains`
  (and `pdai-domains-testnet.netlify.app` for the testnet copy). To use others, replace them wherever
  they appear before deploying: a search of the repo finds them all, tests included. The name cards
  link to the app at the domain set when the contracts are deployed.
- A review by someone other than the author.

## License

MIT. See [LICENSE](LICENSE).
