# The .hex bot

Claims the bridge messages the `.hex` contracts send to Ethereum, copies name changes on PulseChain
over to Ethereum, and pays its own gas out of the payments wallet's budget
([how](../deploy/bot/README.md#money)). It can also fill `.hex` orders placed on Ethereum, but that's
off unless `FILL=true`: names are bought on PulseChain.

**It runs on Railway**, set up in a browser: [deploy/bot/README.md](../deploy/bot/README.md), with
what to fund it with on each network.

To run it on a computer instead, with [Node.js](https://nodejs.org) 22 or later, in this folder:

```bash
npm ci
```

```bash
cp .env.example .env
```

Fill in `.env` from the deploy run summaries (each step's **For the bot** block), then:

```bash
npm start
```

It prints its wallet, its network, and the public key websites seal orders to, which is only used if
buying from Ethereum is switched on (`FILL=true`). That key is made from `BOT_PRIVATE_KEY`, so
there's no other key to keep. `npm run keygen` makes a separate one, if you'd rather set
`BOT_ENCRYPTION_SECRET_KEY` yourself.

**Testnet.** Set `NETWORK=testnet` to run it on PulseChain Testnet v4 and Sepolia, with the testnet
bridge. Give it its own wallet, `.env` and `STATE_FILE`, and set `PULSECHAIN_USDC` to the "USDC from
Sepolia" address step 1 printed. On Railway, the state file goes on the attached volume by itself.

| File | What it does |
|---|---|
| `src/orders.ts` | only with `FILL=true`: reads orders on Ethereum, commits and fills them on PulseChain, refunds the ones it can't fill |
| `src/relay.ts` | claims signed bridge messages on Ethereum, its own USDC first, skipping ones that would change nothing; copies each name at most once an hour, within a daily ETH limit; copies paid for, and the admin's, go at once, and unpaid new names and renewals wait while a copy costs over `COPY_FREE_USDC`, looked at again every five minutes, and left if their owner copies them first; finished messages are forgotten after a week |
| `src/copyfee.ts` | keeps the Ethereum copy fee on the checkout in step with Ethereum's gas, once the admin chooses this bot as the copy bot |
| `src/sync.ts` | copies registrations, renewals and transfers made outside the checkouts |
| `src/treasury.ts` | its money: buys PLS and ETH for gas, keeps a small working balance, draws from the payments wallet's budget and returns any extra, never sending a bridge transfer twice |
| `src/reveal.ts` | the sealed order details, their registrar commitment, and the bot's encryption key |
| `src/buy.ts` | for websites: everything needed to place an order from Ethereum |
| `src/amb.ts` | the bridge's message and signature formats |
| `src/config.ts` | the settings, from environment variables (see `.env.example`) |

`npm test` type-checks and runs the tests. `npm run check-claim` simulates claiming a real, signed
bridge message on Ethereum, to check the claim code against the live mainnet bridge (it sends nothing).
