# pDAI Names website

The pDAI Name Service website: the homepage at pdai.domains, made for the pDAI community, and the
app at app.pdai.domains, where names are bought and managed. Built with Vite, React and
TypeScript.

## The app

[`app/index.html`](app/index.html) and [`src/app`](src/app). One page with three views:

- **Search** (`/`): find a name, with an answer as you type, the same card as the homepage's: free
  (with its price and a Register button that opens its page), premium, reserved, too short or too
  long. Once the contracts are deployed it also asks PulseChain a moment after typing stops, so a
  name someone owns shows as taken (or just expired, in its grace period). Below, the names just
  registered.
- **A name** (`/alice.pdai`): if it's free, choose how long and which token, see exactly what it
  costs, and buy it on PulseChain: reserve it, wait a minute, pay ([`flows.ts`](src/app/flows.ts)).
  Each payment is quoted on both PulseX routers (V1 and V2) and paid along whichever needs less: in
  November 2026, $640 of PLS cost 6.6% more on V2 than on V1. Paying in pDAI shows how many pDAI it
  takes at PulseX's price right now. A token is allowed during the minute, with about 5% to spare in
  case its price moves. Just before paying, the app checks the allowance again, and asks for one more
  approval only if the price rose more than that room allows. If it's taken: who owns it and until
  when. If it's yours: renew it, send it to another wallet, how to sell it (on a PulseChain NFT
  marketplace, as .eth names sell on Ethereum's), and your referral link.
- **My names** (`/names`): the names in the connected wallet, from the site's index of the registry.

Wallets: any browser wallet that announces itself (MetaMask, Rabby, Internet Money and others) or
sits at `window.ethereum` ([`wallet.ts`](src/app/wallet.ts)). Phone wallets by QR code need
WalletConnect, which needs a project ID from reown.com.

**Switching it on.** Fill in [`src/deployment.ts`](src/deployment.ts) from the deploy run summary
(`PDAI_REGISTRY`, `REGISTRAR`, `CHECKOUT`, `USDC` and `START_BLOCK`;
[how](../deploy/website/README.md)). Until the file is filled in, the app searches and prices names,
connects wallets, and plays a purchase through as a walkthrough that sends nothing. For a testnet
copy, fill in `testnet` and set `VITE_NETWORK=testnet` in a second Netlify project's environment
variables.

**Where it lives.** On Netlify, add `app.pdai.domains` as a second domain of this same site:
[`public/_redirects`](public/_redirects) serves the app there, and under `/app` on preview links.

**Referral links.** `pdai.domains/?ref=alice` or `app.pdai.domains/?ref=alice`, where `alice` is
the referrer's .pdai name ([`src/lib/referral.ts`](src/lib/referral.ts)). The visitor's browser
remembers it for 58 days, and their purchase or renewal carries it to the registrar as its referral
tag, `keccak256("alice")`, recorded on-chain in the registrar's `NameRegistered` and `NameRenewed`
events with the amount paid. Referrers are paid from those records: during the launch offer, the
first 58 days after `launchDate` in [`src/deployment.ts`](src/deployment.ts), they earn 10% of what
the buyers they bring pay. The owner's panel in the app says until when.

**Paying referrers.** `app.pdai.domains/referrals` (not in the menu) is for the wallet that
receives .pdai's payments, the registrar's `BENEFICIARY`: it shows the report only when that wallet
is connected. Everything on it can still be read from the chain by anyone. For the days not yet
paid, from the day after the last payout to yesterday (PulseChain's day), kept to the launch offer,
it works out 10% of what each referrer's buyers paid, owed to whoever owns the referring name now
([`src/app/ReferralsPage.tsx`](src/app/ReferralsPage.tsx), adding up in
[`src/lib/payouts.ts`](src/lib/payouts.ts)). It reads the registrar's `NameRegistered` and
`NameRenewed` events from the deployment's start block, in the browser. Self-referrals (the buyer
also owns the referring name) and tags that aren't a name anyone owns are set aside.

**The admin page.** `app.pdai.domains/admin` (not in the menu) opens for a wallet the contracts
give admin powers to, and shows only the powers it has, without saying which wallet it's for
([`src/app/AdminPage.tsx`](src/app/AdminPage.tsx), the calls in [`src/app/admin.ts`](src/app/admin.ts)):

- **Sales.** Pausing takes the registrar's `ROLE_REGISTRAR` on the .pdai registry, so nobody can buy
  a name, and restarting gives it back. The registrar keeps `ROLE_RENEW`, so renewals carry on. A
  name's page says when sales are paused, instead of offering to buy.
- **Prices.** All prices as a share of the list prices: it sets the price oracle's exchange rate for
  every token the registrar takes (USDC and DAI, read from the oracle's `PaymentTokenUpdated`
  events), so none stays cheaper, keeping each price exact to the cent. The app reads the level
  ([`src/app/live.ts`](src/app/live.ts)) and shows prices at it; the homepage's prices are text.
- **Held names.** The names held now (from the registry's `LabelReserved` events), and: hold more,
  hand one to its owner with the roles a buyer gets, and add time to a held or owned name. Holding
  and adding time take `ROLE_REGISTRAR` or `ROLE_RENEW` for those steps only and give it back after;
  if an action stops halfway, the page offers to give it back.

Each change is checked before it's sent, so one the contracts would refuse says why instead of
asking the wallet for a fee.

**Pay all** pays every referrer from the connected wallet in one transaction, in USDC on PulseChain,
through [Disperse](https://disperse.app) (`0xD152f549545093347A162Dce210e7293f1452150`, with the same
code on PulseChain and PulseChain Testnet v4): an approval of the exact total, then one
`disperseToken`. Each run also looks for a payout already sent, one transaction that paid every
referrer exactly what they're owed, and says so instead of offering to pay again. The spreadsheet it
downloads has each wallet and the exact USDC.

**No day is paid twice.** Each Pay all records the days it covers at the end of its transaction:
`PDNS`, then the first and last day, after the call Disperse reads, which Disperse ignores
([`payoutNote`](src/lib/payouts.ts)). The page finds the payments wallet's payouts from the transfers
it made to Disperse, reads their notes, and starts the next payout the day after the last day paid.
Only `PDNS` notes count, so payouts the same wallet makes for HexNS's referrers (`HXNS`) are never
taken for these. It checks again just before sending, so a payout made meanwhile from another device
stops it. A payout made without a note, by hand say, is still recognised if it paid exactly the same
amounts; one carrying another project's note never is.

## Putting it on Netlify

Nothing needs installing: Netlify builds the site from GitHub. Step by step, with the testnet copy
and the launch: [deploy/website/README.md](../deploy/website/README.md).

1. Sign in at [netlify.com](https://www.netlify.com) with your GitHub account.
2. **Add new project > Import an existing project > GitHub**, and pick `pdai-names`.
3. Netlify reads the settings from [`netlify.toml`](../netlify.toml) (build in `web/`, publish
   `web/dist`). Leave the branch as `main` and click **Deploy**.
4. In **Project configuration**, change the project name to `pdai-domains`, for `pdai-domains.netlify.app`.
5. Later, in **Domain management > Add a domain**, add `pdai.domains` and `app.pdai.domains`,
   and follow Netlify's DNS steps at the place you bought the domain.

Every push to `main` then redeploys the site, and every pull request gets its own preview link.

## Changing things

- **The floating names** are people and projects from the pDAI community, listed in
  [`src/data/featured.ts`](src/data/featured.ts) with their X handles: pDAI Conference, LibertySwap,
  NineIronCapital, Your Friend Sommi, Coexisteven, ZKX Wallet, bluntfullstop and Cryptogirl. After
  adding someone, run `npm run avatars` to save their profile picture into `src/assets/avatars` (or
  ask Claude to). Every person shown must also be in
  [`../script/reserved-names.csv`](../script/reserved-names.csv), so nobody can buy their name
  first; the tests check both. A name and photo on the homepage reads as that person backing pDAI
  Names, so it's worth asking them first. On wide screens all eight drift around the words
  ([`FloatingNames.tsx`](src/components/FloatingNames.tsx)): drag one and it springs back to its
  place when let go; click one and it hops and settles. On phones everyone scrolls past in a row,
  and a tap makes a name hop.
- **The background** at the top of the page is deep navy, lit softly in the brand's colours, cyan
  low on the left, magenta in the middle and red high on the right, as the gradient runs across the
  mark, and drifting slowly (`.hero::before` in [`src/styles.css`](src/styles.css), coloured by the
  `--glow-` variables). Dai's two lines run along its bottom edge as a fine rule. It stays still for
  visitors who turn off motion.
- **The `.pdai` on each floating name** is in the brand's gradient, cyan to magenta to red, as it
  is in the headline.
- **The live strip** under the search ("● LIVE · names registered · the latest names", in
  [`LiveStrip.tsx`](src/components/LiveStrip.tsx)) comes straight from the `.pdai` registry on
  PulseChain, through the site's own function at `/api/stats`
  ([`netlify/functions/stats.mts`](netlify/functions/stats.mts)). It switches itself on once the
  registry's address and start block from the deploy's summary are filled in to
  [`src/deployment.ts`](src/deployment.ts), and stays hidden until then. The total shows from 100
  names and the day's count from 10, so it never shows a small number. Only names made of plain
  letters, digits and hyphens, with nothing rude or scammy in them, appear in it. The function
  reads at most about once a minute and keeps its place in Netlify Blobs, which needs no setting
  up. For a copy of the site on the testnet, set `VITE_NETWORK=testnet` in Netlify's environment
  variables.
- **The mark**, "Open D", is in [`src/components/Logo.tsx`](src/components/Logo.tsx), and the
  lockup, the mark with "pDAI Name Service" in white beside it, in
  [`Brand.tsx`](src/components/Brand.tsx). The browser and phone icons made from it are in
  [`public`](public), and every version of it, with how to use it, is in [`../brand`](../brand).
  The on-chain name cards draw it too, and [`Logo.test.ts`](src/components/Logo.test.ts) checks
  every copy is the same shape.
- **The colours**: one dark theme, deep navy, with white as the accent (`--accent`): white buttons
  with navy words, white links, focus rings and selected options. pDAI's colours appear only in the
  brand's gradient (cyan, magenta and red): on the mark (from its bottom left to its top right), on
  `.pdai` in headings, and in the soft light behind the page. Section labels are a soft white.
  They're the variables at the top of [`src/styles.css`](src/styles.css), and the mark's are in
  [`Logo.tsx`](src/components/Logo.tsx).
- **The pDAI token** in "Pay with pDAI" is the token's own logo, in
  [`src/assets/tokens`](src/assets/tokens).
- **PulseChain's logo** is in [`src/assets/chains`](src/assets/chains): the PLS mark from PulseX's
  token list (the same as pulsechain.com's icon). It only shows where names live; the footer says
  pDAI Names isn't affiliated with PulseChain.
- **The chat** ("Goodbye 0x…", in [`Messages.tsx`](src/components/Messages.tsx)), where a friend
  sends some pDAI, and **the name card** ("Yours. Not ours.", in
  [`Ownership.tsx`](src/components/Ownership.tsx)) are small demos. A name typed into the chat shows
  on the card too.
- **The search** on the homepage checks a name as it's typed, and its Register button opens that
  name in the app. A name over 63 characters, or with anything but letters a to z, numbers and
  hyphens, shows what's wrong, with no Register button, as the contracts refuse it. Prices, the 5-year
  limit and the multi-year prices are in [`src/lib/names.ts`](src/lib/names.ts), and the tests check
  them against `script/PdaiDeployer.sol` and `src/PdaiNameRules.sol`. Tokens and the swap routes are
  in [`src/lib/tokens.ts`](src/lib/tokens.ts), for mainnet and the testnet; live quotes ask PulseX
  through public RPCs ([`src/lib/quotes.ts`](src/lib/quotes.ts)).
- **Buying** happens on PulseChain ([`src/app/BuyPanel.tsx`](src/app/BuyPanel.tsx)). The app checks
  the connected wallet holds enough on PulseChain, including a little PLS for the network fee. If it
  doesn't, it shows how to bring money over with LibertySwap, a separate service, linking only to
  its official site, libertyswap.finance: send USDC from Ethereum or another chain and choose PLS on
  PulseChain to receive.
- **The wallet's network**: the app always knows which network the connected wallet is on (a green
  dot in the top bar on PulseChain, amber elsewhere). On any other network, a notice under the top
  bar names it, with one button to switch to PulseChain, or to add PulseChain if the wallet doesn't
  have it, and the details to add it by hand
  ([`src/app/NetworkNotice.tsx`](src/app/NetworkNotice.tsx)).
- **One theme**: the site and the app are dark, the way the brand is drawn, with no light mode. The
  brand's white wordmark and pDAI's gradient need the navy behind them.
- **Reserved names** come straight from `script/reserved-names.csv`, the same list the contracts
  are deployed with, so the search marks exactly those names as reserved. Though the list is outside
  `web/`, a change to it rebuilds the site (`netlify.toml`).
- **Words on the page** are in [`src/components`](src/components): the top of the page in
  `Hero.tsx`, the chat in `Messages.tsx`, the name card in `Ownership.tsx`, and the other sections
  in `Sections.tsx`.

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
