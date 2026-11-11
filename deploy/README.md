# Deploying .hex

You do all of this in a web browser. There's nothing to download or install, and no command prompt.
Do it twice:

1. **On the testnets** (practice copies of PulseChain and Ethereum, with free coins that are worth
   nothing): a full rehearsal.
2. **On mainnet** (the real chains, with real money): the same again, for real.

The rehearsal takes about two hours, much of it waiting for the bridge.

## Who does what

Three websites do the heavy lifting. You make wallets, press buttons and copy addresses from one to
the next.

| | What it does by itself | What you do | The folder it uses |
|---|---|---|---|
| **GitHub** (GitHub Actions: GitHub's computers, which run jobs for you) | Tests the contracts, puts them on the chains, and prints their addresses | Store the deployer's key, press **Run workflow** for each of the three steps, and copy what each one prints | `src/` and `script/` |
| **Railway** (a hosting company) | Runs the bot day and night. It restarts the bot if it stops, and updates it when the code changes | Set it up once, then paste in the bot's settings | `bot/` |
| **Netlify** (another hosting company) | Builds and serves the website and the app. It rebuilds them whenever `main` changes | Connect it once, then fill in one file of addresses | `web/` |

**What gets deployed** (put on a blockchain) are the contracts (smart contracts: programs that live on
a blockchain, whose code nobody can change afterwards). GitHub deploys them. You never handle them
yourself.

## The folders

You don't download any of these. GitHub, Railway and Netlify each take what they need from the repo
(the project's folder on GitHub, with every version of every file).

| Folder | What's in it | Used by |
|---|---|---|
| `src/` | the contracts | GitHub, when you deploy |
| `script/` | the three deploy steps, and [`reserved-names.csv`](../script/reserved-names.csv) (the names set aside at launch) | GitHub, when you deploy |
| `test/` | tests for the contracts | GitHub, before every deploy and every change |
| `bot/` | the bot | Railway |
| `web/` | the website and the app | Netlify |
| `.github/workflows/` | `deploy.yml`, the **Run workflow** button for deploying, and `test.yml`, the checks on every change | GitHub |
| `deploy/` | these guides | you |

**The only files you edit**, both on GitHub's website:

- [`script/reserved-names.csv`](../script/reserved-names.csv), before you deploy, if you want to
  reserve more names.
- [`web/src/deployment.ts`](../web/src/deployment.ts), after you deploy, so the website knows where
  .hex is.

To edit a file: open it on GitHub, click the pencil icon, make the change, then **Commit changes**
(save it into `main`, the version that counts).

## What you'll need

**Accounts:** GitHub (you have it), [Railway](https://railway.com) on its Hobby plan ($5 a month,
including $5 of use, enough for the bot), and [Netlify](https://www.netlify.com) (free). Sign in to
both with GitHub.

**Wallets.** Make them in MetaMask or Rabby, on a computer or phone of your own, not a work laptop.
In MetaMask, add an account, then copy its private key from the account's details.

An **address** (starts with `0x`) is like an account number: safe to share. A **private key** is the
secret that controls a wallet. Anyone who has it can take everything in it, so paste it only where
this guide says. Never paste a seed phrase (the 12 or 24 backup words) anywhere.

| Wallet | For the testnets | For mainnet | Its private key goes in |
|---|---|---|---|
| **Deployer**: pays for deploying, and has no powers once step 3 is done | a new one | another new one | GitHub, as a repository secret |
| **Admin**: can raise or lower all prices together, add or remove payment tokens, or stop sales; add or remove registrars and renewers (a registrar it adds could register an expired name, even one in its 28-day grace period); hand held names to their owners; restyle the name cards wallets and marketplaces show; and add new endings. It can't unregister, move or redirect a live name, or change the price of one length. It can give up each of these powers ([more](../README.md#who-can-do-what)) | any wallet of yours | a new wallet made just for this, with its own recovery phrase ([how](#part-2-mainnet)) | nowhere: you only type its address |
| **Payments**: receives every payment for a name, for good | your wallet, `0x1027…02C6` | your wallet, `0x1027…02C6` | nowhere: step 1's form already has its address |
| **Bot**: the bot's own wallet, with a little gas | a new one | another new one | Railway, as a sealed variable |

**Coins** (gas is the fee a chain charges for each transaction, paid in its own coin):

| | Testnets | Mainnet |
|---|---|---|
| Deployer, on PulseChain (steps 1 and 3) | 10 tPLS, free from the [faucet](https://faucet.v4.testnet.pulsechain.com) (a site that gives out test coins) | 50,000 PLS. Step 1 would have cost about 15,000 at 7 November 2026's gas prices; the rest is in case gas rises |
| Deployer, on Ethereum (step 2) | 0.01 Sepolia ETH, free ([faucets](ethereum/README.md#sepolia-eth)) | 0.02 ETH |
| Bot, on PulseChain | 10 tPLS for gas | 500,000 PLS for gas (about $2.50) |
| Bot, on Ethereum | 0.01 Sepolia ETH | 0.01 ETH |

You fund the bot once. After that it pays its own gas out of your sales, within a budget you set in
the app ([how](bot/README.md#money)). Send what's left in the deployer wallet back to yourself
afterwards.

## Part 1: rehearse on the testnets

1. **Make and fund the testnet wallets**: a deployer and a bot, as above. Add the testnets to your
   wallet: [PulseChain Testnet v4](https://chainlist.org/chain/943) and
   [Sepolia](https://chainlist.org/chain/11155111).

2. **Get test USDC onto PulseChain Testnet v4** (USDC is a dollar stablecoin: names are priced in
   it). It comes from Sepolia over the testnet bridge (the bridge moves coins and messages between
   the two chains), and step 1 won't start until someone has done this once. Bridge about 30 to your
   own wallet: a name costs 10; the rest is for a renewal and the bot's budget.
   [How](pulsechain/README.md#testnets-usdc-from-sepolia), about 20 minutes.

3. **Check the reserved names** in [`script/reserved-names.csv`](../script/reserved-names.csv).
   Step 1 sets them aside.

4. **Give GitHub the deployer's key.** In the repo, go to **Settings**, then **Secrets and variables**,
   then **Actions**, then **New repository secret**. Set the name to `DEPLOYER_PRIVATE_KEY_TESTNET`
   and the secret to the testnet deployer's private key. A repository secret is a value GitHub keeps
   encrypted and only gives to the workflow (the deploy job). Nobody can see it again, not even you.

5. **Run the three steps.** For each one, go to **Actions**, then **deploy**, then **Run workflow**,
   and fill in the form. Run it once with **Send it for real** unticked: that's a dry run, which
   checks everything and sends nothing. If it ends well, run it again ticked. When a run finishes, open
   it and scroll down to its summary, which lists what it made.

   | Step | Where | What you copy from its summary |
   |---|---|---|
   | 1. Deploy on PulseChain | [PulseChain guide](pulsechain/README.md#step-1-deploy-on-pulsechain) | two addresses for step 2, and the **For the bot** lines |
   | 2. Deploy on Ethereum and link it | [Ethereum guide](ethereum/README.md#step-2-deploy-on-ethereum-and-link-it) | two addresses for step 3, and the **For the bot** lines |
   | 3. Link PulseChain | [PulseChain guide](pulsechain/README.md#step-3-link-pulsechain) | nothing: it ends "Linked. .hex is live" |

   Each step takes 5 to 10 minutes. Keep the summaries: the bot and the website need them. Run
   step 3 straight after steps 1 and 2: until then, the deployer's key can still link the bridge
   contracts.

6. **Start the bot on Railway**, in a `testnet` environment (a separate copy of the bot, with its own
   settings). [The bot guide](bot/README.md), about 15 minutes. Copy the wallet and the public key
   it prints, for the website. (The public key is only used if buying from Ethereum is switched on,
   with `FILL=true`.)

7. **Put up a testnet copy of the website.** Fill in the `testnet` part of `web/src/deployment.ts`,
   then add a second Netlify project that shows the testnets. [The website guide](website/README.md).

8. **Try everything** on the testnet copy's app (its address ends in `/app`):

   - [ ] Buy a name on PulseChain Testnet v4 with USDC. It's yours in about two minutes, and on
         Sepolia about 15 minutes later.
   - [ ] Connect a wallet with nothing on PulseChain Testnet v4, and check the app says so and
         points to LibertySwap. (LibertySwap itself only works on mainnet.)
   - [ ] Renew a name, and check the app won't go past 5 years ahead.
   - [ ] Look names up on both chains. Then send one to another wallet on PulseChain, and watch
         Sepolia follow.
   - [ ] Buy a name, and restart the bot straight away (on Railway, the ⋮ menu of its latest
         deployment, then **Restart**). It picks up where it left off, and the name still reaches
         Sepolia.
   - [ ] On the testnet app's payments page (`/app/referrals`), give the bot a budget, and check
         its balances show.
   - [ ] On the admin page (`/app/admin`), with the admin wallet: pause sales and check a name's
         page says so, then restart them. Hold a name, hand it to a wallet, and add a year to
         another held name.
   - [ ] On a testnet deployed with the copy fee (from November 2026): choose the bot under
         **Ethereum copy fee** on the admin page, and check its log says "copy fee: on". Sepolia's
         gas is rarely high enough for a fee, so the rest was tested on local copies of both chains.

## Part 2: mainnet

When everything above has worked, and someone other than the author has reviewed the contracts:

1. **New wallets**: a new deployer and a new bot, funded with real coins as above. The admin is a
   wallet made just for it: in MetaMask, add a new wallet with its own recovery phrase (not another
   account under your everyday one), write the phrase on paper and keep it offline, and use the
   wallet for nothing else. Not the payments wallet, which connects to plenty of sites. If MetaMask
   offers to turn it into a "smart account", say no. Use the same admin for steps 1 and 2. (A Safe,
   a wallet that needs several keys to agree, would be stronger, but Safe's own app doesn't support
   PulseChain.)
2. **Check the reserved names** again.
3. **Add the repository secret** `DEPLOYER_PRIVATE_KEY_MAINNET` with the mainnet deployer's private
   key, the same way as in Part 1.
4. **Run the three steps** with **Mainnet: PulseChain + Ethereum**. To send for real on mainnet, also
   type `mainnet` in the **confirm** box. This guards against a slip of the mouse. In step 1's dry
   run, check the summary says **Payments go to** your wallet,
   `0x102785E63DCD7C2ba1146E96da7fE429155602C6`: every payment for a name goes straight there, and
   it can never be changed afterwards. The form fills it in for you.
5. **Start the bot** in Railway's `production` environment, with the mainnet settings
   ([the bot guide](bot/README.md#mainnet)).
6. **Fill in `mainnet`** in `web/src/deployment.ts`, with `launchDate` set to launch day (the
   referral launch offer, 10% for 58 days, counts from it). That switches on buying in the app and
   the live numbers on the homepage. Then add the domains and launch
   ([the website guide](website/README.md#mainnet-launch)).
7. **Turn on the copy fee** on the admin page, choosing the bot
   ([the bot guide](bot/README.md#mainnet), step 5). Until then every copy to Ethereum is free.

Before step 2 on Ethereum, check the note on
[Ethereum's next upgrade](ethereum/README.md#ethereums-next-upgrade).

Not automated yet: verifying the contracts (publishing their source code on the block explorers
scan.pulsechain.com and etherscan.io, so anyone can check them).

## If a step stops

Fix what it says, then run the same step again. Steps 1 and 2 start afresh each time. Whatever a
stopped run deployed is simply never used.

| It says | What to do |
|---|---|
| USDC isn't on PulseChain Testnet v4 yet | Bridge some USDC from Sepolia first (Part 1, step 2). |
| Add the DEPLOYER_PRIVATE_KEY_TESTNET (or _MAINNET) repository secret | Add the key (Part 1, step 4). |
| type mainnet in the confirm box | It's a real mainnet run: type `mainnet` in the confirm box. |
| ADMIN (or BENEFICIARY) can't be the deployer | The admin, or the wallet receiving payments, is the deployer wallet. Use another wallet: the deployer's key sits in GitHub. |
| ADMIN is a contract that cannot hold ERC-1155 tokens | The admin is a "smart account" or another contract. Use a plain wallet, never upgraded to a smart account. |
| The wallet for name.hex is a contract that cannot hold ERC-1155 tokens | That reserved name's wallet can't hold the name. Leave its wallet empty, so the name is held instead. |
| step 1 used a different deployer key | Run every step of a network with the same deployer key. |
| step 1 was deployed for a different Ethereum network | Choose the same network for all three steps. |
| the two addresses are from different deployments | Copy both addresses from the same step 1 summary. |
| already linked | That step is already done. If step 3 stopped halfway, one of its two links went through: ask for help linking the other. |
| Insufficient funds | Top up the deployer wallet. |

## Words you'll meet

| Word | What it means |
|---|---|
| Testnet / mainnet | A practice copy of a blockchain with worthless coins / the real blockchain |
| PulseChain Testnet v4, Sepolia | The testnets of PulseChain and Ethereum |
| tPLS, Sepolia ETH | The testnets' free coins |
| Faucet | A website that gives out free testnet coins |
| Gas | The fee for a transaction, paid in the chain's coin (PLS or ETH) |
| Contract (smart contract) | A program on a blockchain. Nobody can change its code once it's deployed |
| Deploy | Put contracts on a blockchain |
| Bridge | Moves coins and messages between PulseChain and Ethereum, in about 15 to 20 minutes |
| USDC | A dollar stablecoin: 1 USDC is worth about $1 |
| Working balance | The bit of USDC the bot keeps to buy its own gas with, topped up from your budget |
| Address | A wallet's or contract's public number, starting `0x`. Safe to share |
| Private key | The secret that controls a wallet. Never share it |
| Recovery phrase (seed phrase) | The 12 or 24 words that restore a wallet. Whoever has them has the wallet |
| Admin / deployer | The wallet that can raise or lower all prices together, add registrars and hand out held names, but can't unregister, move or redirect a live name ([more](#what-youll-need)) / the wallet that pays for the deploy |
| Block, start block | The chain's numbered batches of transactions; where the bot starts reading |
| RPC | The web address programs use to talk to a chain, for example `https://rpc.pulsechain.com` |
| Explorer | A website for looking up transactions and contracts: scan.pulsechain.com, etherscan.io |
| Repo (repository) | The project's folder on GitHub |
| `main` | The version of the repo that counts: deploys, the bot and the website all use it |
| Commit | A saved change to the repo |
| Pull request | A set of changes waiting to be added to `main` |
| GitHub Actions, workflow | GitHub's computers, and a job they run (`deploy` is the one with the button) |
| Dry run / Send it for real | A step that checks and sends nothing / one that sends the transactions |
| Run summary | The report at the bottom of a finished run's page |
| Repository secret | A value GitHub keeps hidden and gives only to workflows |
| Railway project, environment, service | Everything for the bot; a separate copy of it (testnet, production); the bot itself |
| Variable, sealed variable | A setting the bot reads when it starts; one Railway hides for good |
| Volume | A small disk that keeps the bot's notes when it restarts |
| Redeploy | Railway rebuilding and restarting the bot, after a change to `main` or its settings |
| Logs | What the bot writes as it works |
| Netlify project | One copy of the website on Netlify: the real one, and a testnet one |
| ENSv2 | The new version of the Ethereum Name Service, which .hex is built on |
