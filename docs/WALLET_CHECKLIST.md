# Wallet checklist

Only MetaMask has Snaps. Every other wallet has to add `.pdai` lookups in its own code, so each one
is a separate ask. The list below is what to have ready first, then who to approach.

## Before approaching anyone

- [ ] The contracts are live on PulseChain, and verified on its block explorer.
- [ ] The admin is a multisig, or has given up its powers. Either way nobody can unregister, move
      or redirect a live name, but wallets will ask who can raise or lower prices, stop sales and
      add registrars (a registrar the admin adds could register an expired name, even one still in
      its 28-day grace period).
- [ ] The `UniversalResolverV2` address on PulseChain is published. A wallet that already looks up
      ENS names can then add `.pdai` mostly by pointing those lookups at it.
- [ ] Primary names work (address to name), so wallets can show `alice.pdai` instead of `0x…`. Not
      built yet.
- [ ] A JavaScript library is on npm, with a one-page integration guide. Not built yet.
- [ ] A public test page lets anyone type a name and see its address.
- [ ] Nobody else sells `.pdai`. On 11 November 2026 ENS, Pulse Domains, PulseChain's copy of ENS,
      Unstoppable Domains and Decentraweb didn't (the README has the details). Two to keep an eye
      on: Pulse Domains' owner could add a controller that creates new endings (a
      `ControllerChanged` event on its Root contract, `0xC5420D626834D38e2Dc3667a9C901218F8f39dce`),
      and Decentraweb sells endings to anyone. Still to check: Handshake, Freename and Space ID.
- [ ] The "`.pdai` names never end in `.eth`" message is on the website and in the docs.

## Wallets

- [ ] **MetaMask:** build a name-lookup Snap for PulseChain, covering the `pdai` ending, and submit
      it for MetaMask's approval (they may ask for an audit). Add an install button to the website.
      Consider having it look up `.pls` too, through Pulse Domains, and `.hex` through HexNS, so it's
      useful to everyone on PulseChain.
- [ ] **Internet Money:** ask the team to add `.pdai` lookups to the send screen, and give them the
      library and the `UniversalResolverV2` address.
- [ ] **ZKX Web3 Wallet:** a browser extension that supports PulseChain, with about 1,000 to 2,000
      users. Check who makes it before linking the project to it; there are scam warnings around a
      "ZKX" token.
- [ ] **OKX Wallet:** announced a PulseChain partnership.
- [ ] **Rabby, Trust Wallet and TokenPocket.**

## Not wallets, but just as important

- [ ] PulseChain's block explorer, so it shows `.pdai` names next to addresses.
- [ ] The send and transfer fields on PulseX, Piteas and LibertySwap.

## Later, optional

- [ ] `pdai.eth` on ENS. Nobody had registered it on 11 November 2026. Holding it means nobody else
      decides where `alice.pdai.eth` points, and could one day let `.pdai` names work in wallets that
      only know ENS.
