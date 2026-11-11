# Deploying .pdai

You do all of this in a web browser. There's nothing to download or install, and no command prompt.
Do it twice:

1. **On the testnet** (a practice copy of PulseChain, with free coins that are worth nothing): a full
   rehearsal.
2. **On mainnet** (the real PulseChain, with real money): the same again, for real.

The rehearsal takes about an hour, most of it waiting for test USDC to arrive.

## Who does what

Two websites do the heavy lifting. You make wallets, press buttons and copy addresses from one to
the other.

| | What it does by itself | What you do | The folder it uses |
|---|---|---|---|
| **GitHub** (GitHub Actions: GitHub's computers, which run jobs for you) | Tests the contracts, puts them on PulseChain, and prints their addresses | Store the deployer's key, press **Run workflow**, and copy what it prints | `src/` and `script/` |
| **Netlify** (a hosting company) | Builds and serves the website and the app. It rebuilds them whenever `main` changes | Connect it once, then fill in one file of addresses | `web/` |

**What gets deployed** (put on a blockchain) are the contracts (smart contracts: programs that live on
a blockchain, whose code nobody can change afterwards). GitHub deploys them. You never handle them
yourself.

There is no bot to run: everything happens on PulseChain, in the buyer's own transactions.

## The folders

You don't download any of these. GitHub and Netlify each take what they need from the repo (the
project's folder on GitHub, with every version of every file).

| Folder | What's in it | Used by |
|---|---|---|
| `src/` | the contracts | GitHub, when you deploy |
| `script/` | the deploy step, and [`reserved-names.csv`](../script/reserved-names.csv) (the names set aside at launch) | GitHub, when you deploy |
| `test/` | tests for the contracts | GitHub, before every deploy and every change |
| `web/` | the website and the app | Netlify |
| `.github/workflows/` | `deploy.yml`, the **Run workflow** button for deploying, and `test.yml`, the checks on every change | GitHub |
| `deploy/` | these guides | you |

**The only files you edit**, both on GitHub's website:

- [`script/reserved-names.csv`](../script/reserved-names.csv), before you deploy, if you want to
  reserve more names.
- [`web/src/deployment.ts`](../web/src/deployment.ts), after you deploy, so the website knows where
  .pdai is.

To edit a file: open it on GitHub, click the pencil icon, make the change, then **Commit changes**
(save it into `main`, the version that counts).

## What you'll need

**Accounts:** GitHub (you have it) and [Netlify](https://www.netlify.com) (free). Sign in to Netlify
with GitHub.

**Wallets.** Make them in MetaMask or Rabby, on a computer or phone of your own, not a work laptop.
In MetaMask, add an account, then copy its private key from the account's details.

An **address** (starts with `0x`) is like an account number: safe to share. A **private key** is the
secret that controls a wallet. Anyone who has it can take everything in it, so paste it only where
this guide says. Never paste a seed phrase (the 12 or 24 backup words) anywhere.

| Wallet | For the testnet | For mainnet | Its private key goes in |
|---|---|---|---|
| **Deployer**: pays for deploying, and has no powers once the deploy is done | a new one | another new one | GitHub, as a repository secret |
| **Admin**: can raise or lower all prices together, add or remove payment tokens, or stop sales; add or remove registrars and renewers (a registrar it adds could register an expired name, even one in its 28-day grace period); hand held names to their owners; restyle the name cards wallets and marketplaces show; and add new endings. It can't unregister, move or redirect a live name, or change the price of one length. It can give up each of these powers ([more](../README.md#who-can-do-what)) | any wallet of yours | a new wallet made just for this, with its own recovery phrase ([how](#part-2-mainnet)) | nowhere: you only type its address |
| **Payments**: receives every payment for a name, for good | your wallet, `0x1027…02C6` | your wallet, `0x1027…02C6` | nowhere: the form already has its address |

**Coins** (gas is the fee a chain charges for each transaction, paid in its own coin): the deployer
needs 10 tPLS on the testnet, free from the [faucet](https://faucet.v4.testnet.pulsechain.com) (a
site that gives out test coins), and 60,000 PLS on mainnet. The deploy uses about 42 million gas,
which would have cost about 20,000 PLS at 11 November 2026's gas prices; the rest is in case gas
rises. Send what's left in the deployer wallet back to yourself afterwards.

## Part 1: rehearse on the testnet

1. **Make and fund the testnet deployer wallet**, as above. Add
   [PulseChain Testnet v4](https://chainlist.org/chain/943) to your wallet.

2. **Get test USDC onto PulseChain Testnet v4**, to buy names with (USDC is a dollar stablecoin:
   names are priced in it). It comes from Sepolia, Ethereum's testnet, over the testnet bridge.
   Bridge about 30 to your own wallet: a name costs 10; the rest is for a renewal.
   [How](pulsechain/README.md#testnet-usdc-from-sepolia), about 20 minutes.

3. **Check the reserved names** in [`script/reserved-names.csv`](../script/reserved-names.csv). The
   deploy sets them aside.

4. **Give GitHub the deployer's key.** In the repo, go to **Settings**, then **Secrets and variables**,
   then **Actions**, then **New repository secret**. Set the name to `DEPLOYER_PRIVATE_KEY_TESTNET`
   and the secret to the testnet deployer's private key. A repository secret is a value GitHub keeps
   encrypted and only gives to the workflow (the deploy job). Nobody can see it again, not even you.

5. **Deploy.** Go to **Actions**, then **deploy**, then **Run workflow**, and fill in the form
   ([what goes where](pulsechain/README.md#deploy-on-pulsechain)). Run it once with **Send it for
   real** unticked: that's a dry run, which checks everything and sends nothing. If it ends well, run
   it again ticked. It takes about 10 minutes. When it finishes, open it and scroll down to its
   summary, which lists what it made, and keep it: the website needs the **For the website** lines.

6. **Put up a testnet copy of the website.** Fill in the `testnet` part of `web/src/deployment.ts`,
   then add a second Netlify project that shows the testnet. [The website guide](website/README.md).

7. **Try everything** on the testnet copy's app (its address ends in `/app`):

   - [ ] Buy a name on PulseChain Testnet v4 with USDC. It's yours in about two minutes, and its
         page and **My names** show it.
   - [ ] Connect a wallet with nothing on PulseChain Testnet v4, and check the app says so and
         points to LibertySwap. (LibertySwap itself only works on mainnet.)
   - [ ] Renew a name, and check the app won't go past 5 years ahead.
   - [ ] Send a name to another wallet, and check its page follows.
   - [ ] On the admin page (`/app/admin`), with the admin wallet: pause sales and check a name's
         page says so, then restart them. Hold a name, hand it to a wallet, and add a year to
         another held name.
   - [ ] Buy a name through a referral link (`/app/?ref=` and a name you own), then check the
         payments page (`/app/referrals`, with the payments wallet) lists it.

   Paying with pDAI, PLS and the other tokens only works on mainnet: PulseX's testnet has no pools
   for the testnet's USDC. The fork tests buy with each of them against a live copy of PulseChain
   instead, on every push.

## Part 2: mainnet

When everything above has worked, and someone other than the author has reviewed the contracts:

1. **A new deployer**, funded with real PLS as above. The admin is a wallet made just for it: in
   MetaMask, add a new wallet with its own recovery phrase (not another account under your everyday
   one), write the phrase on paper and keep it offline, and use the wallet for nothing else. Not the
   payments wallet, which connects to plenty of sites. If MetaMask offers to turn it into a "smart
   account", say no. (A Safe, a wallet that needs several keys to agree, would be stronger, but
   Safe's own app doesn't support PulseChain.)
2. **Check the reserved names** again.
3. **Add the repository secret** `DEPLOYER_PRIVATE_KEY_MAINNET` with the mainnet deployer's private
   key, the same way as in Part 1.
4. **Deploy** with **Mainnet: PulseChain**. To send for real on mainnet, also type `mainnet` in the
   **confirm** box. This guards against a slip of the mouse. In the dry run, check the summary says
   **Payments go to** your wallet, `0x102785E63DCD7C2ba1146E96da7fE429155602C6`: every payment for a
   name goes straight there, and it can never be changed afterwards. The form fills it in for you.
5. **Fill in `mainnet`** in `web/src/deployment.ts`, with `launchDate` set to launch day (the
   referral launch offer, 10% for 58 days, counts from it). That switches on buying in the app and
   the live numbers on the homepage. Then add the domains and launch
   ([the website guide](website/README.md#mainnet-launch)).

Not automated yet: verifying the contracts (publishing their source code on the block explorer,
scan.pulsechain.com, so anyone can check them).

## If the deploy stops

Fix what it says, then run it again. It starts afresh each time. Whatever a stopped run deployed is
simply never used.

| It says | What to do |
|---|---|
| USDC isn't on PulseChain Testnet v4 yet | Someone has to bridge some USDC from Sepolia first (Part 1, step 2). |
| Add the DEPLOYER_PRIVATE_KEY_TESTNET (or _MAINNET) repository secret | Add the key (Part 1, step 4). |
| type mainnet in the confirm box | It's a real mainnet run: type `mainnet` in the confirm box. |
| ADMIN (or BENEFICIARY) can't be the deployer | The admin, or the wallet receiving payments, is the deployer wallet. Use another wallet: the deployer's key sits in GitHub. |
| ADMIN is a contract that cannot hold ERC-1155 tokens | The admin is a "smart account" or another contract. Use a plain wallet, never upgraded to a smart account. |
| The wallet for name.pdai is a contract that cannot hold ERC-1155 tokens | That reserved name's wallet can't hold the name. Leave its wallet empty, so the name is held instead. |
| Insufficient funds | Top up the deployer wallet. |

## Words you'll meet

| Word | What it means |
|---|---|
| Testnet / mainnet | A practice copy of a blockchain with worthless coins / the real blockchain |
| PulseChain Testnet v4 | PulseChain's testnet |
| Sepolia | Ethereum's testnet, where the testnet's USDC comes from |
| tPLS | The testnet's free coin |
| Faucet | A website that gives out free testnet coins |
| Gas | The fee for a transaction, paid in PLS |
| Contract (smart contract) | A program on a blockchain. Nobody can change its code once it's deployed |
| Deploy | Put contracts on a blockchain |
| USDC | A dollar stablecoin: 1 USDC is worth about $1 |
| pDAI | The copy of DAI made when PulseChain launched, with its own price on PulseX |
| Address | A wallet's or contract's public number, starting `0x`. Safe to share |
| Private key | The secret that controls a wallet. Never share it |
| Recovery phrase (seed phrase) | The 12 or 24 words that restore a wallet. Whoever has them has the wallet |
| Admin / deployer | The wallet that can raise or lower all prices together, add registrars and hand out held names, but can't unregister, move or redirect a live name ([more](#what-youll-need)) / the wallet that pays for the deploy |
| Block, start block | The chain's numbered batches of transactions; where the website starts reading |
| RPC | The web address programs use to talk to a chain, for example `https://rpc.pulsechain.com` |
| Explorer | A website for looking up transactions and contracts: scan.pulsechain.com |
| Repo (repository) | The project's folder on GitHub |
| `main` | The version of the repo that counts: deploys and the website use it |
| Commit | A saved change to the repo |
| Pull request | A set of changes waiting to be added to `main` |
| GitHub Actions, workflow | GitHub's computers, and a job they run (`deploy` is the one with the button) |
| Dry run / Send it for real | A deploy that checks and sends nothing / one that sends the transactions |
| Run summary | The report at the bottom of a finished run's page |
| Repository secret | A value GitHub keeps hidden and gives only to workflows |
| Netlify project | One copy of the website on Netlify: the real one, and a testnet one |
| ENSv2 | The new version of the Ethereum Name Service, which .pdai is built on |
