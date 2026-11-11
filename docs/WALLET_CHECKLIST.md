# Wallet checklist

Only MetaMask has Snaps. Every other wallet has to add `.hex` lookups in its own code, so each one is
a separate ask. The list below is what to have ready first, then who to approach.

## Before approaching anyone

- [ ] The contracts are live on PulseChain and Ethereum, and verified on both block explorers.
- [ ] The admin is a multisig, or has given up its powers. Either way nobody can unregister, move
      or redirect a live name, but wallets will ask who can raise or lower prices, stop sales and
      add registrars (a registrar the admin adds could register an expired name, even one still in
      its 28-day grace period).
- [ ] The `UniversalResolverV2` addresses on both chains are published. A wallet that already looks
      up ENS names can then add `.hex` mostly by pointing those lookups at them.
- [ ] Primary names work (address to name), so wallets can show `alice.hex` instead of `0x…`. Not
      built yet.
- [ ] A JavaScript library is on npm, with a one-page integration guide. Not built yet.
- [ ] A public test page lets anyone type a name and see its address.
- [ ] Nobody else sells `.hex`. On 5 November 2026 ENS, Pulse Domains, PulseChain's copy of ENS,
      Unstoppable Domains and Decentraweb didn't. Still to check: Handshake and Freename.
- [ ] The "`.hex` names never end in `.eth`" message is on the website and in the docs.

## Wallets

- [ ] **MetaMask:** build a name-lookup Snap for PulseChain and Ethereum, covering the `hex` ending,
      and submit it for MetaMask's approval (they may ask for an audit). Have it check PulseChain,
      where names live, so it never relies on the Ethereum copy while that is catching up (about
      15 minutes after any change: a purchase, renewal or transfer). Add an install button to the
      website. Consider having it look up `.pls` too, through Pulse Domains, so it's useful to
      everyone on PulseChain.
- [ ] **Internet Money:** ask the team to add `.hex` lookups to the send screen, and give them the
      library and the `UniversalResolverV2` addresses.
- [ ] **ZKX Web3 Wallet:** a browser extension that supports PulseChain, with about 1,000 to 2,000
      users. Check who makes it before linking the project to it; there are scam warnings around a
      "ZKX" token.
- [ ] **OKX Wallet:** announced a PulseChain partnership.
- [ ] **Rabby, Trust Wallet and TokenPocket.**

## Not wallets, but just as important

- [ ] PulseChain's block explorer, so it shows `.hex` names next to addresses.
- [ ] The send and transfer fields on PulseX, Piteas and LibertySwap.

## Later, optional

- [ ] `alice.hex.eth`, if `hex.eth` is ever for sale. It would make `.hex` names work in wallets
      that only know ENS. It belongs to someone else and is paid up until 18 March 2028.
