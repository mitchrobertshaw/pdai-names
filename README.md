# pdai-names

Pay for a `.pdai` name with any token on PulseChain, at a fixed $5 a year.

This repo holds `AnyTokenCheckout`, a small contract that sits in front of an ENSv2-style
registrar. A buyer pays with PLS, HEX, PLSX, pDAI or any other token with a PulseX pool. The
contract swaps it into a dollar stablecoin (DAI bridged from Ethereum) on PulseX, pays the
registrar exactly its price, and sends the buyer the change. The registrar only ever sees
stablecoins, so the price stays at $5 without a price oracle.

> **Status:** unaudited and not deployed. Don't put real money through it until it has been
> reviewed by someone other than its author.

## How a purchase works

1. **Commit.** The buyer's wallet calls `commit` on the registrar with a hash of the name, the
   owner and a secret. Nothing is paid yet. This stops anyone who sees the purchase coming from
   grabbing the name first.
2. **Wait** for the registrar's minimum commitment age (ENS uses one minute).
3. **Pay.** The buyer calls `registerWithToken` (after approving the token) or `registerWithPLS`
   on this contract, with the same name, owner and secret.
4. In that one transaction the contract:
   - takes the buyer's token, or wraps their PLS,
   - swaps it to DAI on PulseX V1 or V2,
   - checks the DAI covers the price, and reverts if it doesn't,
   - pays the registrar exactly the price, which registers the name to the owner,
   - sends whatever DAI is left over back to the buyer.

Renewals work the same way through `renewWithToken` and `renewWithPLS`, without the commit step.

## Using it from a website

- Call `quoteRegister(label, duration, router, path)` for the price and roughly how much of the
  buyer's token covers it. Pass an empty path to quote in DAI itself.
- Add a buffer before paying: 1–2% for price movement, plus twice the token's transfer tax if it
  has one (the token is taxed once on the way in and again on the way to the pool).
- Pass the price as `amountOutMin`, so the swap fails early rather than underpaying.
- The change comes back in DAI, even when the buyer paid in PLS.

## Safety properties

- **No owner and no admin.** Nothing can be changed after deployment: no upgrades, no pause, no
  way to add routers or redirect payments.
- **Holds nothing.** Every amount is measured as a balance change inside the transaction, so
  tokens with transfer taxes work. Tokens sent to the contract by mistake are stuck there for
  good; they are never paid out to anyone.
- **Only allow-listed routers.** The PulseX routers are fixed at deployment.
- **Bounded loss to sandwich attacks.** The most a buyer can lose is the buffer they added on
  top of the quote, a few cents on a $5 name.
- **Re-entry blocked.** A malicious token can't call back into the contract mid-payment.

## Before this can go live: ENSv2 needs porting to PulseChain

`AnyTokenCheckout` pays a registrar; it isn't one. The plan is to deploy ENSv2
([ensdomains/contracts-v2](https://github.com/ensdomains/contracts-v2), MIT) for the `.pdai`
ending. ENSv2 can't be deployed to PulseChain as it is:

- **It uses an opcode PulseChain doesn't have.** PulseChain lacks the opcodes from Ethereum's
  March 2024 upgrade (`TSTORE`, `MCOPY`; checked against the live chain on 2026-11-05). ENSv2 is
  compiled for that upgrade, and uses `mcopy` directly in `contracts/src/utils/LibMem.sol`,
  `contracts/src/resolver/PermissionedResolver.sol` and `contracts/src/dns/DNSTLDResolver.sol`.
  Those spots need a plain memory-copy loop instead, and everything compiled with
  `evm_version = "shanghai"`. ENSv2's own `L2ReverseRegistrar.sol` already includes such a
  helper.
- **Payment settings.** Configure its `StandardRentPriceOracle` with DAI and USDC bridged from
  Ethereum at $5 a year, and charge more for 1–3 letter names so they aren't all squatted on
  day one.
- **Admin roles.** Give them up, or put them behind a timelock, once the ending is set up.

## Addresses used (PulseChain, checked 2026-11-05)

| What | Address |
|---|---|
| WPLS | `0xA1077a294dDE1B09bB078844df40758a5D0f9a27` |
| DAI bridged from Ethereum (payment token) | `0xefD766cCb38EaF1dfd701853BFCe31359239F305` |
| USDC bridged from Ethereum | `0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07` |
| PulseX V1 router | `0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02` |
| PulseX V2 router | `0x165C3410fC91EF562C50559f7d2289fEbed552d9` |

## Running the tests

Nothing needs installing on your own computer: GitHub runs the tests on every push. See the
**Actions** tab, workflow **test**. There are two sets:

- **Unit tests** (`test/AnyTokenCheckout.t.sol`), with stand-in tokens, router and registrar.
  They cover paying with a token, a taxed token, PLS and DAI directly; gifts; premiums; renewals;
  every rejection path; re-entry; stray balances; leftover approvals; and a fuzz test of the
  accounting.
- **Fork tests** (`test/fork/`), against a live copy of PulseChain with the real PulseX routers
  and real PLS, HEX, PLSX and pDAI. Only the registrar is a stand-in.

If you do have [Foundry](https://getfoundry.sh):

```bash
./install-deps.sh
```

```bash
forge test
```

## Deploying without installing anything

The **deploy** workflow deploys from GitHub's servers. You start it from the GitHub website,
which works from a phone too.

1. **Create a new wallet just for deploying** and send it a little PLS for gas. Don't use your
   main wallet: the contract has no owner, so this key has no power once the deployment is done,
   and you can empty it afterwards.
2. **Add its private key as a secret.** In the repo, go to Settings > Environments > New
   environment, name it `pulsechain`, and add a secret called `DEPLOYER_PRIVATE_KEY`. On the
   same page you can require your own approval before each run.
3. **Do a dry run.** Actions > deploy > Run workflow, enter the registrar's address, and leave
   **broadcast** unticked. This simulates the deployment against the live chain and sends
   nothing.
4. **Deploy.** Run it again with **broadcast** ticked. The new contract's address is in the run's
   log, and the deployment record is attached to the run as an artifact.

## License

MIT. See [LICENSE](LICENSE).
