# The website, on Netlify

[Netlify](https://www.netlify.com) builds the website (hexns.domains) and the app
(app.hexns.domains) from the `web/` folder. Whenever `main` changes, it rebuilds them by itself in a
minute or two.

The website needs to know where .hex is: the addresses of its contracts, and the bot's wallet.
They all go in one file, [`web/src/deployment.ts`](../../web/src/deployment.ts), which has a part for
each network. Until a network's part is filled in, the website shows no live numbers for it, and the
app can search and price names but not buy them.

New to this? [Start here](../README.md).

## 1. Connect Netlify (once)

Skip this if the site is already on Netlify.

1. Sign in at [netlify.com](https://www.netlify.com) with GitHub.
2. **Add new project**, then **Import an existing project**, then **GitHub**. Pick `hex-names`, and
   give Netlify access to it if it asks.
3. Netlify reads its settings from [`netlify.toml`](../../netlify.toml), which tells it to build the
   `web/` folder. Leave the branch as `main` and click **Deploy**.
4. In **Project configuration**, change the project's name to `hexns`, for the address
   hexns.netlify.app.

## 2. A testnet copy, for the rehearsal

This is a second Netlify project, built from the same repo, that shows the testnets.

1. **Add new project**, then **Import an existing project**, then **GitHub**, and pick `hex-names`
   again. Name it `hexns-testnet`.
2. In its **Project configuration**, open **Environment variables** (settings the build reads), and
   add `VITE_NETWORK` with the value `testnet`.
3. Open **Deploys**, then **Trigger deploy**, so it rebuilds with that setting.

Its app is at `https://hexns-testnet.netlify.app/app`. It won't buy anything until the `testnet`
part of `deployment.ts` is filled in.

## 3. Fill in deployment.ts

On GitHub, open [`web/src/deployment.ts`](../../web/src/deployment.ts) and click the pencil icon.
Near the bottom, replace the line `testnet: null,` with the block below, putting in the values from
the run summaries and the bot's log. Then click **Commit changes**. Both Netlify projects rebuild by
themselves.

```ts
  testnet: {
    launchDate: "2026-11-20", // the day you deployed on the testnets: the referral offer counts from it
    pulsechain: {
      rpc: "https://rpc.v4.testnet.pulsechain.com",
      registry: "0x…", // PULSECHAIN_HEX_REGISTRY, from step 1
      registrar: "0x…", // PULSECHAIN_REGISTRAR, from step 1
      checkout: "0x…", // PULSECHAIN_CHECKOUT, from step 1 (AnyTokenCheckout in runs before the copy fee)
      usdc: "0x…", // PULSECHAIN_USDC, from step 1
      startBlock: 0, // START_BLOCK_PULSECHAIN, from step 1: a number, without quotes
    },
    ethereum: {
      rpc: "https://ethereum-sepolia-rpc.publicnode.com",
      orderBook: "0x…", // ETHEREUM_ORDER_BOOK, from step 2 (only for buying from Ethereum)
      usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Circle's test USDC on Sepolia
    },
    bot: {
      publicKey: "0x…", // from the bot's log on Railway (only for buying from Ethereum)
      minFee: 0.25, // the bot's fee per order, in dollars (only for buying from Ethereum)
      address: "0x…", // the bot's wallet: the first 0x… in its log
    },
  },
```

Keep every quote mark and comma. Everything after `//` on a line is a note, and can stay. If
Netlify's build fails afterwards, its deploy log names the line it didn't like.

`orderBook`, `publicKey` and `minFee` are only used if buying from Ethereum is switched on
(`FILL=true`). It's off, but fill them in anyway, so they're ready.

`launchDate` is the day you deploy, written year-month-day. The referral launch offer counts from
it: referrers earn 10% of what the buyers they bring pay for 58 days, and the app tells name owners
until when.

## Mainnet launch

1. **Fill in the `mainnet` part** the same way, replacing `mainnet: null,`, with the values from the
   mainnet runs and the bot in Railway's `production` environment:

   ```ts
     mainnet: {
       launchDate: "2026-12-01", // launch day: referrers earn 10% for the 58 days from it
       pulsechain: {
         rpc: "https://rpc.pulsechain.com",
         registry: "0x…", // PULSECHAIN_HEX_REGISTRY
         registrar: "0x…", // PULSECHAIN_REGISTRAR
         checkout: "0x…", // PULSECHAIN_CHECKOUT
         usdc: "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07", // USDC bridged from Ethereum (PULSECHAIN_USDC)
         startBlock: 0, // START_BLOCK_PULSECHAIN
       },
       ethereum: {
         rpc: "https://ethereum-rpc.publicnode.com",
         orderBook: "0x…", // ETHEREUM_ORDER_BOOK (only for buying from Ethereum)
         usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum
       },
       bot: {
         publicKey: "0x…", // from the production bot's log (only for buying from Ethereum)
         minFee: 0.25, // only for buying from Ethereum
         address: "0x…", // the production bot's wallet
       },
     },
   ```

   That switches on buying in the app, and the live numbers on the homepage. Set `launchDate` to
   the day you launch: the 58 days of the referral offer count from it.

2. **Add the domains.** In the `hexns` project, open **Domain management**, then **Add a domain**,
   and add `hexns.domains`, then `app.hexns.domains`. Follow Netlify's steps at the company you
   bought the domain from (it asks you to add DNS records: the settings that point a domain at a
   website). The app is served on `app.hexns.domains` by
   [`web/public/_redirects`](../../web/public/_redirects).

After launch you can delete the `hexns-testnet` project, or keep it for trying changes.

## The admin page

The admin wallet's everyday powers have a page in the app: `app.hexns.domains/admin`, or `/app/admin`
on the testnet copy. It isn't in the menu. Connect the admin wallet; any other wallet is told only
that the page is private. Each change is a transaction from the admin wallet.

- **Sales:** **Pause sales** stops new names being bought, until **Restart sales**. Renewals carry on,
  so nobody loses a name meanwhile, and a name's page says sales are paused.
- **Prices:** type all prices as a % of the list prices ($10, $160 and $320 a year), say 120, and
  click **Set prices**. It's one transaction per token the registrar takes (USDC and DAI). Buying and
  renewing, the multi-year discounts and the premium for expired names all follow, exactly, and the
  app shows the new prices at once. The homepage's prices are text: ask for them to be updated.
- **Held names:** the names held now and until when. **Hold more names** takes a list (each a
  transaction, plus one before and one after). **Hand a held name to its owner** makes it theirs
  until its hold would have ended; a second transaction sends its copy to Ethereum, and the bot
  copies it at once. **Add time** holds a name longer, or gives an owned name free time.
- **Ethereum copy fee:** what it is now, and who sets it. While Ethereum is busy and a copy costs
  over $2, buyers can pay the rest to copy their name at once, wait for a free copy, or, busier
  than the bot's ETH covers, copy it themselves on Ethereum in ETH
  ([how it works](../bot/README.md#money)). **Choose it** makes the bot the copy bot, which turns
  the fee on: the bot's wallet is filled in from `bot.address`. **The most a copy can cost** is a
  safety limit ($1,000 at deploy), in case the bot ever sets a wrong fee; below it, buyers can pay
  whatever copying at once costs. 0 switches the fee off, and every copy is free. **Copy a name to Ethereum now**
  sends any name's copy from the admin wallet, and the bot copies it at once, at the project's cost:
  for a name stuck waiting, say.

## Paying referrers

During the launch offer, referrers earn 10% of what the buyers they bring pay. You pay them from the
wallet that receives the payments for names, `0x1027…02C6`, so the money comes straight from where
the payments land.

1. Open `app.hexns.domains/referrals` (it isn't in the menu) and connect that wallet. Any other
   wallet is told only that the page is private.
2. The page says what's been paid, read from the chain, and which days the next payout covers: from
   the day after the last one (at first, the launch offer's first day) to yesterday. Click **Work it
   out**. It lists each referrer, the wallet to pay (whoever owns the referring name now) and the
   USDC owed.
3. Click **Pay all**. Your wallet asks twice: to allow the exact total, then to send it. One
   transaction pays everyone, in USDC on PulseChain. Keep some PLS in the wallet for the network fee.

Pay as often as you like, say once a month. Each payout records on the chain the days it paid for,
and the next one starts the day after, so no day is paid twice, whichever device or browser you use.
If a payout went out from elsewhere while the page was open, it won't send yours. **Download the
spreadsheet (CSV)** keeps a copy with exact amounts.

Set aside, and not paid: self-referrals (someone using another name of their own as the referrer),
and links naming a .hex name nobody owns.
