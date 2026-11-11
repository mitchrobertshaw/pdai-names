# HexNS website

The Hex Name Service website: the homepage at hexns.domains, made for Hexicans, and the app at
app.hexns.domains, where names are bought and managed. Built with Vite, React and TypeScript.

## The app

[`app/index.html`](app/index.html) and [`src/app`](src/app). One page with three views:

- **Search** (`/`): find a name, with an answer as you type, the same card as the homepage's: free
  (with its price and a Register button that opens its page), premium, reserved, too short or too
  long. Once the contracts are deployed it also asks PulseChain a moment after typing stops, so a
  name someone owns shows as taken (or just expired, in its grace period). Below, the names just
  registered.
- **A name** (`/alice.hex`): if it's free, choose how long and which token, see exactly what it
  costs, and buy it on PulseChain: reserve it, wait a minute, pay ([`flows.ts`](src/app/flows.ts)).
  Each payment is quoted on both PulseX routers (V1 and V2) and paid along whichever needs less: in
  November 2026, $640 of PLS cost 6.6% more on V2 than on V1. A token is allowed during the minute,
  with about 5% to spare in case its price moves. Just before paying, the app checks the allowance
  again, and asks for one more approval only if the price rose more than that room allows. If it's
  taken: who owns it and until when, and whether Ethereum's copy is up to date. If it's yours: renew
  it, send it to another wallet, how to sell it (on a PulseChain NFT marketplace, as .eth names sell
  on Ethereum's), and your referral link.
- **The Ethereum copy fee** ([`src/app/copy.ts`](src/app/copy.ts), the panels in
  [`src/app/CopyChoice.tsx`](src/app/CopyChoice.tsx)). While a copy costs over $2 on Ethereum, the
  bot sets a fee on the checkout, and buying or renewing offers **Later, free** (the copy goes once
  Ethereum's fees fall) or **Now, +$x** (the `...AndCopy` checkout functions, paying at most the fee
  quoted). Sending a name pays it after the transfer (`payCopyFee`, in PLS or USDC), so the new owner
  shows on Ethereum at once. A name's page reads its copy on Ethereum (found from the checkout's
  `MIRROR_SYNC`, its partner there, and that one's registry) and, while it's behind and there's a
  fee, offers **Copy it now**. Copying at once is offered at any price up to the admin's safety
  limit ($1,000), while the bot holds the ETH to do it straight away. When it doesn't (the bot sets
  the fee to the most there is), or a copy would cost more than the limit, the panels offer
  **Later, free** or **Myself, in ETH** instead. A checkout from before the copy fee has none, and the
  app pays the old way.
- **Copying it yourself** (`copyOnEthereum` and the purchase flows in [`flows.ts`](src/app/flows.ts),
  the bridge's messages in [`copy.ts`](src/app/copy.ts) and [`lib/amb.ts`](src/lib/amb.ts)). With
  **Myself, in ETH**, after paying it finds the name's copy message in the payment's receipt, waits
  for the bridge's validators to sign it, switches the wallet to Ethereum and calls the bridge's
  `executeSignatures` there, paying Ethereum's fee in ETH. A name's page does the same for its
  newest copy message (found from `HexMirrorSync`'s `Synced` events), with the fee shown on the
  button: the gas it uses, from `eth_createAccessList`, at today's gas price. Before the wallet is
  asked, it checks the wallet holds the copy's whole gas limit at its highest fee (the bridge sets
  aside the million gas a copy may use) and says how much if not. It looks again just before
  sending: a copy someone else delivered first (the bot, as fees fell, or another person) ends as
  **already copied**, with nothing sent, or, if both went into one block, says someone else copied
  it a moment before.
- **My names** (`/names`): the names in the connected wallet, from the site's index of the registry.

Wallets: any browser wallet that announces itself (MetaMask, Rabby, Internet Money and others) or
sits at `window.ethereum` ([`wallet.ts`](src/app/wallet.ts)). Phone wallets by QR code need
WalletConnect, which needs a project ID from reown.com.

**Switching it on.** Fill in [`src/deployment.ts`](src/deployment.ts) from the deploy run summaries
and the bot's log ([how](../deploy/website/README.md)). The bot's public key and fee there are only
used if buying from Ethereum is switched on (`FILL=true`). Until the file is filled in, the app
searches and prices names, connects wallets, and plays a purchase through as a walkthrough that
sends nothing. For a testnet copy, fill in `testnet` and set `VITE_NETWORK=testnet` in a second
Netlify project's environment variables.

**Where it lives.** On Netlify, add `app.hexns.domains` as a second domain of this same site:
[`public/_redirects`](public/_redirects) serves the app there, and under `/app` on preview links.

**Referral links.** `hexns.domains/?ref=alice` or `app.hexns.domains/?ref=alice`, where `alice` is
the referrer's .hex name ([`src/lib/referral.ts`](src/lib/referral.ts)). The visitor's browser
remembers it for 58 days, and their purchase or renewal carries it to the registrar as its referral
tag, `keccak256("alice")`, recorded on-chain in the registrar's `NameRegistered` and `NameRenewed`
events with the amount paid. Referrers are paid from those records: during the launch offer, the
first 58 days after `launchDate` in [`src/deployment.ts`](src/deployment.ts), they earn 10% of what the
buyers they bring pay. The owner's panel in the app says until when.

**Paying referrers.** `app.hexns.domains/referrals` (not in the menu) is for the wallet that receives
.hex's payments, the registrar's `BENEFICIARY`: it shows the report only when that wallet is
connected. Everything on it can still be read from the chain by anyone. For the days not yet paid,
from the day after the last payout to yesterday (PulseChain's day), kept to the launch offer, it
works out 10% of what each referrer's buyers paid, owed to whoever owns the referring name now ([`src/app/ReferralsPage.tsx`](src/app/ReferralsPage.tsx), adding up in
[`src/lib/payouts.ts`](src/lib/payouts.ts)). It reads the registrar's `NameRegistered` and
`NameRenewed` events from the deployment's start block, in the browser. Self-referrals (the buyer
also owns the referring name) and tags that aren't a name anyone owns are set aside. The same page,
titled "Referral payouts", also shows the bot's balances and sets the budget it may draw from this
wallet for gas ([how](../deploy/bot/README.md#money)).

**The admin page.** `app.hexns.domains/admin` (not in the menu) opens for a wallet the contracts give
admin powers to, and shows only the powers it has, without saying which wallet it's for
([`src/app/AdminPage.tsx`](src/app/AdminPage.tsx), the calls in [`src/app/admin.ts`](src/app/admin.ts)):

- **Sales.** Pausing takes the registrar's `ROLE_REGISTRAR` on the .hex registry, so nobody can buy
  a name, and restarting gives it back. The registrar keeps `ROLE_RENEW`, so renewals carry on. A
  name's page says when sales are paused, instead of offering to buy.
- **Prices.** All prices as a share of the list prices: it sets the price oracle's exchange rate for
  every token the registrar takes (USDC and DAI, read from the oracle's `PaymentTokenUpdated`
  events), so none stays cheaper, keeping each price exact to the cent. The app reads the level
  ([`src/app/live.ts`](src/app/live.ts)) and shows prices at it; the homepage's prices are text.
- **Held names.** The names held now (from the registry's `LabelReserved` events), and: hold more,
  hand one to its owner with the roles a buyer gets, and add time to a held or owned name. Holding
  and adding time take `ROLE_REGISTRAR` or `ROLE_RENEW` for those steps only and give it back after;
  if an action stops halfway, the page offers to give it back. Handing a name out also sends its
  copy to Ethereum from the admin wallet, which the bot copies at once.
- **Ethereum copy fee.** For the checkout's owner: the fee now, the copy bot (`setCopyBot`) and the
  most a copy can cost (`setMaxCopyFee`, 0 switches it off), and **Copy a name to Ethereum now**,
  which calls `HexMirrorSync.sync` from the admin wallet: the bot copies what the admin sends at
  once, at the project's cost.

Each change is checked before it's sent, so one the contracts would refuse says why instead of
asking the wallet for a fee.

**Pay all** pays every referrer from the connected wallet in one transaction, in USDC on PulseChain,
through [Disperse](https://disperse.app) (`0xD152f549545093347A162Dce210e7293f1452150`, with the same
code on PulseChain and PulseChain Testnet v4): an approval of the exact total, then one
`disperseToken`. Each run also looks for a payout already sent, one transaction that paid every
referrer exactly what they're owed, and says so instead of offering to pay again. The spreadsheet it
downloads has each wallet and the exact USDC.

**No day is paid twice.** Each Pay all records the days it covers at the end of its transaction:
`HXNS`, then the first and last day, after the call Disperse reads, which Disperse ignores
([`payoutNote`](src/lib/payouts.ts)). The page finds the payments wallet's payouts from the transfers
it made to Disperse, reads their notes, and starts the next payout the day after the last day paid.
It checks again just before sending, so a payout made meanwhile from another device stops it. A
payout made before payouts carried notes is still recognised if it paid exactly the same amounts.

**Tested end to end** on local copies of PulseChain Testnet v4 and Sepolia with the real contracts
and the bot: buying on PulseChain with USDC, renewing, sending, My names, and a referral tag landing
on-chain. Ordering from Sepolia with ETH (filled by the bot) was tested too, before buying from
Ethereum was switched off.

## Putting it on Netlify

Nothing needs installing: Netlify builds the site from GitHub. Step by step, with the testnet copy
and the launch: [deploy/website/README.md](../deploy/website/README.md).

1. Sign in at [netlify.com](https://www.netlify.com) with your GitHub account.
2. **Add new project > Import an existing project > GitHub**, and pick `hex-names`.
3. Netlify reads the settings from [`netlify.toml`](../netlify.toml) (build in `web/`, publish
   `web/dist`). Leave the branch as `main` and click **Deploy**.
4. In **Project configuration**, change the project name to `hexns`, for `hexns.netlify.app`.
5. Later, in **Domain management > Add a domain**, add `hexns.domains` and `app.hexns.domains`, and
   follow Netlify's DNS steps at the place you bought the domain.

Every push to `main` then redeploys the site, and every pull request gets its own preview link.

## Changing things

- **The floating names** are HEX KOLs, listed in [`src/data/featured.ts`](src/data/featured.ts)
  with their X handles. After adding someone, run `npm run avatars` to save their profile picture
  into `src/assets/avatars` (or ask Claude to). Every person shown must also be in
  [`../script/reserved-names.csv`](../script/reserved-names.csv), so nobody can buy their name
  first; the tests check both. A name and photo on the homepage reads as that person backing
  HexNS, so it's worth asking them first. On wide screens the first six drift around the words
  ([`FloatingNames.tsx`](src/components/FloatingNames.tsx)): drag one and it springs back to its
  place when let go; click one and it hops and settles. On phones everyone scrolls past in a row,
  and a tap makes a name hop.
- **The background** at the top of the page is a light wash of the HEX colours that drifts
  slowly (`.hero::before` in [`src/styles.css`](src/styles.css), coloured by the `--hero-`
  variables for light and dark). It stays still for visitors who turn off motion.
- **The `.hex` on each floating name** is in that person's colour, picked from their profile
  picture: `tone` in [`src/data/featured.ts`](src/data/featured.ts), one shade for light and one
  for dark, each easy to read on its background (the tests check).
- **The live strip** under the search ("● LIVE · names registered · the latest names", in
  [`LiveStrip.tsx`](src/components/LiveStrip.tsx)) comes straight from the `.hex` registry on
  PulseChain, through the site's own function at `/api/stats`
  ([`netlify/functions/stats.mts`](netlify/functions/stats.mts)). It switches itself on once the
  registry's address and start block from step 1's summary are filled in to
  [`src/deployment.ts`](src/deployment.ts), and stays hidden until then. The total shows from 100
  names and the day's count from 10, so it never shows a small number. Only names made of plain
  letters, digits and hyphens, with nothing rude or scammy in them, appear in it. The function
  reads at most about once a minute and keeps its place in Netlify Blobs, which needs no setting
  up. For a copy of the site on the testnet, set `VITE_NETWORK=testnet` in Netlify's environment
  variables.
- **The HexNS mark**, "Route", is in [`src/components/Logo.tsx`](src/components/Logo.tsx); the
  browser and phone icons made from it are in [`public`](public), and every version of it, with
  how to use it, is in [`../brand`](../brand).
- **The chain logos** are PulseChain's and Ethereum's own, in [`src/assets/chains`](src/assets/chains):
  PulseChain's is the PLS mark from PulseX's token list (the same as pulsechain.com's icon), and
  Ethereum's is `eth-diamond-purple.svg` from [ethereum.org/assets](https://ethereum.org/assets/).
  They only show which chains a name works on; the footer says HexNS isn't affiliated with either.
- **The chat** ("Goodbye 0x…", in [`Messages.tsx`](src/components/Messages.tsx)) and **the name
  card** ("Yours. Not ours.", in [`Ownership.tsx`](src/components/Ownership.tsx)) are small
  demos. A name typed into the chat shows on the card too.
- **The search** on the homepage checks a name as it's typed, and its Register button opens that
  name in the app. A name over 63 characters, or with anything but letters a to z, numbers and
  hyphens, shows what's wrong, with no Register button, as the contracts refuse it. Prices, the 5-year
  limit and the multi-year prices are in [`src/lib/names.ts`](src/lib/names.ts), and the tests check
  them against `script/HexDeployer.sol` and `src/pulsechain/HexNameRules.sol`. Tokens and the swap
  routes are in [`src/lib/tokens.ts`](src/lib/tokens.ts), for mainnet and the testnets; live quotes
  ask PulseX through public RPCs ([`src/lib/quotes.ts`](src/lib/quotes.ts)).
- **Buying** happens on PulseChain only ([`src/app/BuyPanel.tsx`](src/app/BuyPanel.tsx)). The app
  checks the connected wallet holds enough on PulseChain, including a little PLS for the network
  fee. If it doesn't, it shows how to bring money over with LibertySwap, a separate service, linking
  only to its official site, libertyswap.finance: send USDC from Ethereum or another chain and
  choose PLS on PulseChain to receive.
- **The wallet's network**: the app always knows which network the connected wallet is on (a green
  dot in the top bar on PulseChain, amber elsewhere). On any other network, a notice under the top
  bar names it, with one button to switch to PulseChain, or to add PulseChain if the wallet doesn't
  have it, and the details to add it by hand
  ([`src/app/NetworkNotice.tsx`](src/app/NetworkNotice.tsx)).
- **Light and dark**: the moon and sun button in the top bar switches between them and remembers
  the choice. Until a visitor picks, the site follows their device's setting.
- **Reserved names** come straight from `script/reserved-names.csv`, the same list the contracts
  are deployed with, so the search marks exactly those names as reserved. Though the list is outside
  `web/`, a change to it rebuilds the site (`netlify.toml`).
- **Words on the page** are in [`src/components`](src/components): the top of the page in
  `Hero.tsx`, the chat in `Messages.tsx`, the name card in `Ownership.tsx`, and the other sections
  in `Sections.tsx`.
- **Colours and layout** are in [`src/styles.css`](src/styles.css), with light and dark versions at
  the top.

## Running it yourself

Optional, with Node.js 22 or later:

```bash
npm ci
```

```bash
npm run dev
```

`npm test` runs the tests, which GitHub also runs on every push, and `npm run build` makes the
site in `dist/`: the homepage, and the app in `dist/app/` (open `/app/` in `npm run dev`).

`npm run build:single` makes the homepage as one file, `dist-single/index.html`, with everything
inside it: scripts, styles, fonts and pictures. It opens straight from a computer by
double-clicking, so it's handy for sharing a preview.
