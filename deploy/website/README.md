# The website, on Netlify

[Netlify](https://www.netlify.com) builds the website (pdai.domains) and the app
(app.pdai.domains) from the `web/` folder. Whenever `main` changes, it rebuilds them by itself in a
minute or two.

The website needs to know where .pdai is: the addresses of its contracts. They all go in one file,
[`web/src/deployment.ts`](../../web/src/deployment.ts), which has a part for each network. Until a
network's part is filled in, the website shows no live numbers for it, and the app can search and
price names but not buy them.

New to this? [Start here](../README.md).

## 1. Connect Netlify (once)

Skip this if the site is already on Netlify.

1. Sign in at [netlify.com](https://www.netlify.com) with GitHub.
2. **Add new project**, then **Import an existing project**, then **GitHub**. Pick `pdai-names`, and
   give Netlify access to it if it asks.
3. Netlify reads its settings from [`netlify.toml`](../../netlify.toml), which tells it to build the
   `web/` folder. Leave the branch as `main` and click **Deploy**.
4. In **Project configuration**, change the project's name to `pdai-domains`, for the address
   pdai-domains.netlify.app.

## 2. A testnet copy, for the rehearsal

This is a second Netlify project, built from the same repo, that shows the testnet.

1. **Add new project**, then **Import an existing project**, then **GitHub**, and pick `pdai-names`
   again. Name it `pdai-domains-testnet`.
2. In its **Project configuration**, open **Environment variables** (settings the build reads), and
   add `VITE_NETWORK` with the value `testnet`.
3. Open **Deploys**, then **Trigger deploy**, so it rebuilds with that setting.

Its app is at `https://pdai-domains-testnet.netlify.app/app`, the address the testnet's name cards link
to. It won't buy anything until the `testnet` part of `deployment.ts` is filled in.

## 3. Fill in deployment.ts

On GitHub, open [`web/src/deployment.ts`](../../web/src/deployment.ts) and click the pencil icon.
Near the bottom, replace the line `testnet: null,` with the block below, putting in the values from
the deploy's summary (its **For the website** block). Then click **Commit changes**. Both Netlify
projects rebuild by themselves.

```ts
  testnet: {
    launchDate: "2026-11-20", // the day you deployed on the testnet: the referral offer counts from it
    pulsechain: {
      rpc: "https://rpc.v4.testnet.pulsechain.com",
      registry: "0x…", // PDAI_REGISTRY
      registrar: "0x…", // REGISTRAR
      checkout: "0x…", // CHECKOUT
      usdc: "0x…", // USDC
      startBlock: 0, // START_BLOCK: a number, without quotes
    },
  },
```

Keep every quote mark and comma. Everything after `//` on a line is a note, and can stay. If
Netlify's build fails afterwards, its deploy log names the line it didn't like.

`launchDate` is the day you deploy, written year-month-day. The referral launch offer counts from
it: referrers earn 10% of what the buyers they bring pay for 58 days, and the app tells name owners
until when.

## Mainnet launch

1. **Fill in the `mainnet` part** the same way, replacing `mainnet: null,`, with the values from the
   mainnet run's summary:

   ```ts
     mainnet: {
       launchDate: "2026-12-01", // launch day: referrers earn 10% for the 58 days from it
       pulsechain: {
         rpc: "https://rpc.pulsechain.com",
         registry: "0x…", // PDAI_REGISTRY
         registrar: "0x…", // REGISTRAR
         checkout: "0x…", // CHECKOUT
         usdc: "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07", // USDC bridged from Ethereum (USDC)
         startBlock: 0, // START_BLOCK
       },
     },
   ```

   That switches on buying in the app, and the live numbers on the homepage. Set `launchDate` to
   the day you launch: the 58 days of the referral offer count from it.

2. **Add the domains.** In the `pdai-domains` project, open **Domain management**, then **Add a domain**,
   and add `pdai.domains`, then `app.pdai.domains`. Follow Netlify's steps at the company you
   bought the domain from (it asks you to add DNS records: the settings that point a domain at a
   website). The app is served on `app.pdai.domains` by
   [`web/public/_redirects`](../../web/public/_redirects). Using another domain? Change it in the
   repo first ([how](../../README.md#not-done-yet)).

After launch you can delete the `pdai-domains-testnet` project, or keep it for trying changes.

## The admin page

The admin wallet's everyday powers have a page in the app: `app.pdai.domains/admin`, or
`/app/admin` on the testnet copy. It isn't in the menu. Connect the admin wallet; any other wallet
is told only that the page is private. Each change is a transaction from the admin wallet.

- **Sales:** **Pause sales** stops new names being bought, until **Restart sales**. Renewals carry on,
  so nobody loses a name meanwhile, and a name's page says sales are paused.
- **Prices:** type all prices as a % of the list prices ($10, $160 and $320 a year), say 120, and
  click **Set prices**. It's one transaction per token the registrar takes (USDC and DAI). Buying and
  renewing, the multi-year discounts and the premium for expired names all follow, exactly, and the
  app shows the new prices at once. The homepage's prices are text: ask for them to be updated.
- **Held names:** the names held now and until when. **Hold more names** takes a list (each a
  transaction, plus one before and one after). **Hand a held name to its owner** makes it theirs
  until its hold would have ended. **Add time** holds a name longer, or gives an owned name free
  time.

## Paying referrers

During the launch offer, referrers earn 10% of what the buyers they bring pay. You pay them from the
wallet that receives the payments for names, `0x1027…02C6`, so the money comes straight from where
the payments land.

1. Open `app.pdai.domains/referrals` (it isn't in the menu) and connect that wallet. Any other
   wallet is told only that the page is private.
2. The page says what's been paid, read from the chain, and which days the next payout covers: from
   the day after the last one (at first, the launch offer's first day) to yesterday. Click **Work it
   out**. It lists each referrer, the wallet to pay (whoever owns the referring name now) and the
   USDC owed.
3. Click **Pay all**. Your wallet asks twice: to allow the exact total, then to send it. One
   transaction pays everyone, in USDC on PulseChain. Keep some PLS in the wallet for the network fee.

Pay as often as you like, say once a month. Each payout records on the chain the days it paid for,
marked as pDAI Names' (`PDNS`), and the next one starts the day after, so no day is paid twice,
whichever device or browser you use. Payouts the same wallet makes for HexNS (marked `HXNS`) don't
count here. If a payout went out from elsewhere while the page was open, it won't send yours.
**Download the spreadsheet (CSV)** keeps a copy with exact amounts.

Set aside, and not paid: self-referrals (someone using another name of their own as the referrer),
and links naming a .pdai name nobody owns.
