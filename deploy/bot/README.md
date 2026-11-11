# The bot, on Railway

The bot is a small program that keeps the Ethereum side of .hex running:

- It carries PulseChain's updates across the bridge, so Ethereum's copy of every name stays current.
- It pays its own gas, out of your sales, within a budget you set ([money](#money)).

Names are bought on PulseChain, so the bot never handles a sale. If it stops, PulseChain carries on
as normal and Ethereum's copy falls behind until it's back. A restart is harmless: it picks up where
it left off.

[Railway](https://railway.com) runs it for you. It builds the bot from the `bot/` folder of `main`,
starts it again if it ever stops, and updates it when `bot/` changes. Railway calls each separate
copy an **environment**. You'll have two, each with its own wallet, settings, disk and logs:

| Railway environment | Network | When |
|---|---|---|
| `testnet` | PulseChain Testnet v4 and Sepolia | the rehearsal |
| `production` | PulseChain and Ethereum | mainnet, for real |

New to this? [Start here](../README.md).

## Before you start

- **Steps 1 to 3 done** on that network. You'll need the **For the bot** block from the summaries of
  steps 1 and 2.
- **The bot's own wallet**, new, and funded. It has the same address on both chains.

  | | Testnet | Mainnet |
  |---|---|---|
  | On PulseChain, for gas | 10 tPLS ([faucet](https://faucet.v4.testnet.pulsechain.com)) | 500,000 PLS, about $2.50 |
  | On Ethereum, for gas (claiming bridge messages) | 0.01 Sepolia ETH | 0.01 ETH, about $22 |

  That's the only time you fund it. After that it pays its own way ([money](#money)). It needs no
  USDC from you: it draws a small working balance from your payments wallet's budget.

## 1. Set up Railway (once)

1. **Sign in** at [railway.com](https://railway.com) with GitHub, and choose the **Hobby** plan:
   $5 a month, which includes $5 of use, and the bot uses less. The free trial won't do: it can't
   keep restarting the bot for good.
2. **New Project**, then **Empty Project**. In the project's **Settings**, name it `hexns-bot`.
3. **Make the testnet environment.** At the top of the page there's an environment menu (it says
   `production`). Choose **+ New Environment**, then **Empty Environment**, and name it `testnet`.

## 2. Add the bot

Check that the environment menu at the top says `testnet` (or `production`, for mainnet).

1. **Add it from GitHub:** click **New** (top right), then **GitHub Repo**, then `hex-names`. If
   it isn't listed, choose **Configure GitHub App** and give Railway access to `hex-names`. The bot
   appears on the canvas (the project's board). Its first build fails, because it has no settings
   yet. That's expected.

2. **Point it at the bot's folder.** Click the bot, then **Settings**:

   | Setting | Set it to | Why |
   |---|---|---|
   | Root Directory | `/bot` | Railway builds only the bot's folder |
   | Watch Paths | `/bot/**` | it updates the bot only when the bot changes, not the website |
   | Restart Policy | Always | it starts the bot again if it ever stops |

3. **Give it a volume** (a small disk that keeps its files when the bot restarts). Right-click an
   empty part of the canvas and choose **Volume**. Or press Ctrl+K (⌘K on a Mac) and type "volume".
   Pick the bot, and set the **mount path** (where the disk appears to the bot) to `/data`. The bot
   keeps its notes there. Without one, every restart makes it re-read every block since the deploy.

4. **Enter its settings** (variables: settings the bot reads when it starts). Open **Variables**,
   then **RAW Editor**, and paste these three lines, with the bot wallet's private key:

   ```
   NETWORK=testnet
   RAILPACK_NODE_VERSION=24
   BOT_PRIVATE_KEY=0x...
   ```

   Under them, paste the **For the bot** lines from step 1's summary, then step 2's. Save.

   | Line | What it is |
   |---|---|
   | `NETWORK` | `testnet`, or `mainnet` in the `production` environment |
   | `RAILPACK_NODE_VERSION` | the version of Node.js (what the bot runs on) for Railway to use |
   | `BOT_PRIVATE_KEY` | the bot wallet's private key |
   | `PULSECHAIN_...`, `ETHEREUM_...`, `START_BLOCK_...` | where .hex's contracts are, and the block each was deployed in, from the run summaries |

5. **Seal the private key.** On the `BOT_PRIVATE_KEY` row, open the ⋮ menu and choose **Seal**.
   Railway still gives it to the bot, but never shows it again to anyone, you included. You can
   replace it later, but not read it.

6. **Apply it.** Railway holds changes back until you apply them, and shows how many are waiting in
   a bar at the top. Click **Details**, then **Deploy**.

## 3. Check it's running

Click the bot, then its latest deployment, then **Deploy Logs** (what the bot writes as it works).
Within a minute you should see:

```
hex-names bot 0x… on the testnets (PulseChain Testnet v4 + Sepolia)
  buying from Ethereum is off (FILL=false): names are bought on PulseChain
  order encryption public key, for the website (bot.publicKey in web/src/deployment.ts): 0x… (made from the bot's wallet key)
  fill orders: false, claim bridge messages: true, copy name changes: true, pay its own gas: true
  copy fee: kept up to date on 0x… once the admin chooses this bot as the copy bot; the project pays up to 2 USDC a copy
  remembers its place in /data/state.json
```

- **The first `0x…`** is the bot's wallet. Check it's the one you funded. It goes in the website's
  settings too, as `bot.address`, so the payments page can show its balances.
- **Copy the public key**, the long `0x…` after "for the website", into the website's settings
  ([the website guide](../website/README.md) says where). Buying from Ethereum is off, so nothing
  uses it now, but it's ready if that's ever switched on.
- **"WARNING: no volume is attached"** means the volume is missing: see 2.3.
- **"WARNING: the bot is short of its working balance … the payments wallet's budget for it has run
  out"**, on its first run, is expected: it has no budget until you set one on the payments page
  (Mainnet, step 4). Within five minutes of that it draws its working balance, and the warning stops.
- **"… is not set"** means a setting is missing: check the Variables.
- **Lines ending "(will retry)"** are passing hiccups, such as a slow RPC. It tries again by itself.
- **"daily: working balance … PLS … ETH …"**, once a day: its balances, and its budget from your
  payments wallet.
- **"gas: bought …"** and **"balance: …"** are it paying its own way ([money](#money)).
- **"bridge: holding back a claim, …"**, at most once an hour, says why a claim is waiting: a name
  copied less than an hour ago, the day's limit reached, a new name or renewal waiting for
  Ethereum's fees to fall ([money](#money)), or ETH kept back to claim its own USDC. It goes through
  by itself later.
- **"copy fee: …"** says whether the copy fee is on, and what it is ([money](#money)). Until you
  choose the bot on the admin page (Mainnet, step 5), it says "off until this bot is chosen as the
  copy bot". On the testnet as first deployed, before the copy fee, it says "off
  (PULSECHAIN_CHECKOUT not set)": that's expected, and every copy there is free.
- **"WARNING: the bot is …"**, at most once a day, means it needs you: it says what for.

On its first run the bot also copies the reserved names that went straight to a wallet over to
Ethereum. You'll see "yourfriendsommi.hex changed on PulseChain; copy sent to Ethereum". About 15
minutes later comes "bridge message … from HexMirrorSync claimed on Ethereum".

## Mainnet

After steps 1 to 3 on mainnet:

1. Switch the environment menu at the top to `production`.
2. Do [section 2](#2-add-the-bot) again there, with:
   - `NETWORK=mainnet`;
   - the **mainnet** bot wallet's private key: a different wallet from the testnet one, funded with
     real coins;
   - the **For the bot** lines from the mainnet runs.
3. Check the logs, and copy its wallet and public key into the `mainnet` part of
   `web/src/deployment.ts` ([the website guide](../website/README.md)).
4. **Give it a budget.** Once the website has the bot's wallet, open the app's payments page,
   `app.hexns.domains/referrals`, with your payments wallet (`0x1027…02C6`). Under **The bot**, set
   a budget, say 150 USDC, and approve it in your wallet. That's what it may draw from your
   payments wallet for its gas, and for the ETH it keeps for copies people pay for (about $42 to
   $84, [money](#money)). Do the same on the testnet site in the rehearsal.
5. **Turn on the copy fee.** Open the app's admin page, `app.hexns.domains/admin`, with the admin
   wallet. Under **Ethereum copy fee**, check the bot's wallet is filled in (the first `0x…` in its
   log), and click **Choose it**. Within a minute the bot's log says "copy fee: on, at most 1000
   USDC". Until then every copy is free, as before ([money](#money)).

After the rehearsal you can delete the `testnet` environment (project **Settings**, then
**Environments**) to stop paying for it, or keep it for trying changes.

## Money

The bot runs on autopilot: you fund it once with a little gas, and it pays its own way from then on.

**Every sale goes straight to your payments wallet.** Names are bought on PulseChain, and the
registrar pays each price to your payments wallet. That was fixed in step 1. The bot never touches
a sale.

**Gas comes out of revenue.** The bot keeps a small working balance of USDC on PulseChain, $20
(`FLOAT_USDC`). When its gas runs low it buys more with it: PLS on PulseX ($2 at a time, under
200,000 PLS) and ETH on Uniswap ($15 at a time under 0.003 ETH, sent to Ethereum over the bridge
first, which charges 0.3% in that direction). When the working balance runs low, it draws what it
needs from your payments wallet, up to the budget you set on the app's payments page. If the
working balance can't cover a purchase of gas, it draws the difference first. If it ever holds more
than it needs, the extra comes back to your payments wallet.

**When Ethereum's gas is high,** the next copy can need more than 0.003 ETH. Then the bot keeps
enough for it at the gas price of the moment, buying what that takes, up to $100 at a time
(`ETH_BUY_MAX_USDC`), so copies don't wait for gas to fall. It only does so while today's limit on
copying (below) leaves room: ETH it couldn't spend would just sit there. The settings `ETH_LOW`
(0.003), `ETH_BUY_USDC` (15), `PLS_LOW` (200000) and `PLS_BUY_USDC` (2) change the rest.

**When Ethereum is busy,** the copy fee keeps the project's cost down. The project pays up to $2 of
each copy (`COPY_FREE_USDC`). When a copy costs more, the bot sets a copy fee on the checkout, about
once a minute: the part over $2, and a quarter more for gas rising before the copy goes out. Buyers
and renewers choose between their copy going free once fees fall, or at once for the fee; sending a
name through the app pays it. The bot copies:

- a copy someone paid for, or one the admin sent (the admin page's hand-outs and **Copy it now**):
  at once, whatever gas costs, and outside the daily limit below;
- a change of owner made elsewhere, on a marketplace say: at once, within the limits below, as the
  old owner would otherwise still get what's sent to the name on Ethereum;
- a new name or renewal nobody paid for: once a copy costs $2 or less again.

The fee goes to the bot's working balance, so what's over its $20 comes back to your payments
wallet with everything else. With the fee switched off on the admin page, or before you choose the
bot, every copy is free, within the limits below. Each copy's real cost comes from the gas the bot's
own copies used, so the fee follows Ethereum's upgrades by itself.

**Copies people pay for go at once**, so while the fee is on the bot keeps a little ETH on hand for
them: `COPY_NOW_ETH`, 0.02 ETH (about $42). It buys it only while copies are free, when Ethereum is
cheap: once gas is high, bringing ETH over the bridge costs more than it's worth. Ethereum only
takes a transaction from a wallet holding its whole gas limit at its highest fee, and a copy's
claim asks for far more gas than it uses (the bridge sets aside the full million a copy may use),
so the bot offers copying at once only while it holds that, for every paid copy still to go. 0.02
ETH covers that up to about 7 to 10 gwei, and twice that just after a top-up. Busier than that,
paying the bot is paused, and buyers choose between a free copy once fees fall and **copying it
themselves**: after paying, their wallet delivers the copy on Ethereum, paying Ethereum's fee in ETH,
however busy it is. To offer paying the bot at busier times, raise `COPY_NOW_ETH`: 0.1 ETH covers up
to about 35 to 50 gwei. The most a copy can cost, on the admin page ($1,000 at deploy), is only a
safety limit, in case the bot ever sets a wrong fee.

**It never clogs on copies that wait.** Copies held back for Ethereum's fees stay queued in its
records, and it looks at each again every five minutes rather than every few seconds, so a long busy
spell costs it little. One its owner copied meanwhile is left alone ("was delivered on Ethereum by
someone else" in its log). The rest go free within a minute or so of fees falling, or of the fee
being switched off: it looks at them all again then ("copies held back for Ethereum's fees now go").
Finished messages are forgotten after a week, so its records stay small.

**It never sends money twice.** It notes each transfer over the bridge before waiting for it, and
knows its own transfers when it sees them on the bridge, so a failed wait or a restart never sends
the same money again. On Ethereum it claims its own USDC first, and keeps enough ETH back to do so.

**What you'll see in your payments wallet:** the price of every name sold, and now and then a small
draw by the bot for gas. The app's payments page shows the bot's balances and the budget left.

**How often you need to do anything:** normally never. When you pay referrers each month, glance at
the bot on the same page. If its budget is running low, raise it. If the bot can't fix something
itself, its log says so, once a day, starting "WARNING".

**Costs.** Railway's Hobby plan, $5 a month. Gas, at 10 November 2026's prices: about 4 cents to copy
each name, renewal or transfer to Ethereum. A $100 budget covers about 2,500 of those. (A copy used
about 300,000 gas on a local copy of Ethereum in November 2026. It used about a million on Sepolia,
which already runs Ethereum's next upgrade, so copies may cost three times as much after that.)

**Limits on copying names.** So that nobody can run up its Ethereum gas by changing a name over and
over, it copies each name at most once an hour (the newest change wins), and spends at most 0.02 ETH
a day copying names, about 1,100 copies at November 2026's gas prices. The rest wait until the next
day (UTC): nothing is lost, as a name works on PulseChain all along and its copy only lags. The
limit is in ETH, so fewer copies fit when gas is high: about 65 a day at 1 gwei, 6 at 10 gwei, and
none above about 65 gwei (a third as many after Ethereum's next upgrade, if copies then cost what
they do on Sepolia). If gas stays high, raise it. Copies paid for, and those the admin sends, go regardless. The settings
`RELAY_NAME_COOLDOWN_MINUTES` (60), `RELAY_DAILY_ETH` (0.02) and `COPY_FREE_USDC` (2) change these.

## Keeping it safe

- The bot's wallet only ever holds a little gas, its $20 working balance and, while the copy fee is
  on, the ETH it keeps for paid copies (0.05 to 0.1 ETH). The deployer's and admin's keys never go
  on Railway.
- A stolen bot key could take those, and draw up to the budget left in your payments wallet: that's
  why the budget has a limit. If you ever think the key has leaked, press **Stop it
  drawing** on the payments page, then give the bot a new wallet.
- Seal the key (2.5). Turn on two-factor sign-in for Railway and GitHub (your phone gives a code
  each time you sign in).
- Anyone who can open the Railway project can change the bot's settings. Keep it to yourself.

## Changing it later

- **New code:** when a change to `bot/` reaches `main`, Railway updates the bot by itself. The bot
  saves its place, stops, and the new version carries on from there.
- **New settings:** edit them under **Variables**, then **Details** and **Deploy** in the bar at the
  top, as in 2.6.

The optional settings (other RPCs, the limits on copying names, and those only used if buying from
Ethereum is switched on, such as the bot's fee) are listed in
[`bot/.env.example`](../../bot/.env.example). On/off settings (`FILL`, `RELAY`, `SYNC`, `TREASURY`)
take true/false, 1/0, yes/no or on/off; anything else stops the bot, and its log says which setting.
To run the bot on a computer instead, see [`bot/README.md`](../../bot/README.md).
