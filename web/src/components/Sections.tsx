import type { ReactNode } from "react";

import { MAX_YEARS, PRICES, priceFor, YEARLY_PRICE } from "../lib/names";
import { appUrl } from "../site";
import { AddPulseChain } from "./AddPulseChain";
import { ChainLogo } from "./ChainLogo";
import { ArrowIcon, CheckIcon, CrossIcon } from "./icons";

const PRICE = `$${YEARLY_PRICE}`;

function SectionHeading({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="section__heading">
      <p className="kicker">{kicker}</p>
      <h2>{title}</h2>
      {children ? <p className="section__intro">{children}</p> : null}
    </div>
  );
}

function Resolves({ chain }: { chain: string }) {
  return (
    <p className="resolves">
      <span className="resolves__name">
        you<span className="pill__tld">.hex</span>
      </span>
      <span className="resolves__arrow" aria-hidden="true">
        →
      </span>
      <span className="resolves__address">0x7a3F…91c2</span>
      <span className="visually-hidden"> on {chain}</span>
    </p>
  );
}

export function BothChains() {
  return (
    <section className="section" id="chains" aria-labelledby="chains-title">
      <div className="container">
        <SectionHeading
          kicker="PulseChain and Ethereum"
          title={<span id="chains-title">One name, covered on both chains</span>}
        >
          Live on PulseChain, still on Ethereum, or somewhere in between? Your .hex name works on both, so you&rsquo;re
          covered wherever you end up. From {PRICE} a year, for both chains.
        </SectionHeading>
        <div className="chains">
          <article className="card chain chain--pulsechain">
            <div className="chain__top">
              <ChainLogo chain="pulsechain" size={48} />
              <p className="chain__badge">Where your name lives</p>
            </div>
            <h3>PulseChain</h3>
            <p>
              Buy, renew and manage your name here, and sell it on PulseChain NFT marketplaces. Changes show up straight
              away.
            </p>
            <Resolves chain="PulseChain" />
            <AddPulseChain />
          </article>
          <div className="chains__link" aria-hidden="true">
            <ArrowIcon />
            <span>Copied automatically</span>
          </div>
          <article className="card chain chain--ethereum">
            <div className="chain__top">
              <ChainLogo chain="ethereum" size={48} />
              <p className="chain__badge">Copied automatically</p>
            </div>
            <h3>Ethereum</h3>
            <p>Every name is copied here, usually about 15 minutes after a change, so Ethereum wallets and apps find it too.</p>
            <Resolves chain="Ethereum" />
          </article>
        </div>
        <ul className="ticks ticks--grid">
          <li>
            <CheckIcon size={18} /> Buy once on PulseChain, and it&rsquo;s yours on both
          </li>
          <li>
            <CheckIcon size={18} /> Points to your wallet on both chains
          </li>
          <li>
            <CheckIcon size={18} /> Renew once and both chains stay yours
          </li>
          <li>
            <CheckIcon size={18} /> Chain agnostic? You&rsquo;re covered either way, just in case
          </li>
        </ul>
      </div>
    </section>
  );
}

const TOKENS = ["PLS", "HEX", "PLSX", "eHEX", "WETH", "USDC", "USDT", "DAI"];

export function Features() {
  return (
    <section className="section" aria-labelledby="features-title">
      <div className="container">
        <SectionHeading kicker="What you get" title={<span id="features-title">A name that works for Hexicans</span>} />
        <div className="bento">
          <article className="card bento__item bento__item--wide">
            <div className="bento__art art-chains" aria-hidden="true">
              <ChainLogo chain="pulsechain" size={56} />
              <span className="art-chains__wire" />
              <span className="art-chains__name">
                <span>
                  you<span className="pill__tld">.hex</span>
                </span>
                <small>From {PRICE} a year, both chains</small>
              </span>
              <span className="art-chains__wire" />
              <ChainLogo chain="ethereum" size={56} />
            </div>
            <div className="bento__text">
              <h3>One price, both chains</h3>
              <p>
                One yearly price, from {PRICE}, covers your name on PulseChain and Ethereum. No paying twice, no
                keeping two names in step.
              </p>
            </div>
          </article>

          <article className="card bento__item">
            <div className="bento__art art-tokens" aria-hidden="true">
              <span className="art-tokens__bag">
                {TOKENS.map((token) => (
                  <span key={token} className="art-tokens__chip">
                    {token}
                  </span>
                ))}
              </span>
              <span className="art-tokens__arrow">
                <ArrowIcon />
              </span>
              <span className="art-tokens__total">From {PRICE} a year</span>
            </div>
            <div className="bento__text">
              <h3>Pay with your bag</h3>
              <p>
                PLS, HEX, eHEX, PLSX, WETH, USDC, USDT or DAI, on PulseChain. It&rsquo;s swapped at checkout, so prices stay
                in dollars.
              </p>
            </div>
          </article>

          <article className="card bento__item">
            <div className="bento__art art-owner" aria-hidden="true">
              <span className="art-owner__row">
                Move it or sell it
                <b className="art-owner__yes">
                  <CheckIcon size={14} /> You
                </b>
              </span>
              <span className="art-owner__row">
                Change where it points
                <b className="art-owner__yes">
                  <CheckIcon size={14} /> You
                </b>
              </span>
              <span className="art-owner__row">
                Take it from you
                <b className="art-owner__no">
                  <CrossIcon size={14} /> Nobody
                </b>
              </span>
            </div>
            <div className="bento__text">
              <h3>Nobody can take it</h3>
              <p>Not us, not anyone. It&rsquo;s yours for as long as you renew it.</p>
            </div>
          </article>

          <article className="card bento__item bento__item--wide">
            <div className="bento__art art-code" aria-hidden="true">
              <span className="art-code__window">
                <span className="art-code__comment">{"// wallets look up .hex like .eth"}</span>
                <span>
                  <span className="art-code__fn">lookup</span>(
                  <span className="art-code__str">&quot;you.hex&quot;</span>)
                </span>
                <span className="art-code__out">→ 0x7a3F…91c2</span>
              </span>
            </div>
            <div className="bento__text">
              <h3>Built on ENS v2</h3>
              <p>
                Made from the open-source code of the next version of ENS, so wallets and apps can add .hex with lookups
                they already use.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Search",
    text: `Find a name you like. Names of 5 characters or more are ${PRICE} a year, for both chains.`,
  },
  {
    title: "Buy it on PulseChain",
    text: "Pay with PLS, HEX, PLSX, eHEX, WETH, USDC, USDT or DAI. Money on another chain? LibertySwap brings it over in minutes.",
  },
  {
    title: "Use it everywhere",
    text: "Share yourname.hex instead of your address. It points to your wallet on both chains.",
  },
];

export function HowItWorks() {
  return (
    <section className="section section--tint" id="how" aria-labelledby="how-title">
      <div className="container">
        <SectionHeading kicker="How it works" title={<span id="how-title">Three steps to your name</span>} />
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li className="card step" key={step.title}>
              <span className="step__number">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section className="section" id="pricing" aria-labelledby="pricing-title">
      <div className="container pricing">
        <div>
          <p className="kicker">Pricing</p>
          <h2 id="pricing-title">One price for both chains</h2>
          <p className="section__intro">
            One name on PulseChain and Ethereum, for one yearly price, whatever you pay with.
          </p>
          <ul className="ticks">
            <li>
              <CheckIcon size={18} /> No paying twice for two chains
            </li>
            <li>
              <CheckIcon size={18} /> Pay in PLS, HEX, eHEX, PLSX, WETH, USDC, USDT or DAI
            </li>
            <li>
              <CheckIcon size={18} /> 28 days&rsquo; grace to renew if you forget
            </li>
          </ul>
        </div>
        <div className="card price-card">
          <p className="price">
            <span className="grad-text">{PRICE}</span>
            <span className="price__unit">a year</span>
          </p>
          <p className="price__for">for names of 5 characters or more, on both chains</p>
          <a className="button button--primary price-card__cta" href="#top">
            Find your name
          </a>
          <p className="price-card__scarce">
            Only {(36 ** 3).toLocaleString("en")} three-character names are made of letters and digits. Once one is
            registered, it&rsquo;s taken for as long as its owner renews it.
          </p>
          <details className="price-more">
            <summary>Shorter names, and 5 years for the price of 2</summary>
            <table className="price-table">
              <caption className="visually-hidden">Yearly price by name length, covering both chains</caption>
              <thead>
                <tr>
                  <th scope="col">Name length</th>
                  <th scope="col">A year</th>
                  <th scope="col">5 years</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">5 characters or more</th>
                  <td>${PRICES.fivePlus}</td>
                  <td>${priceFor(5, MAX_YEARS).total}</td>
                </tr>
                <tr>
                  <th scope="row">4 characters</th>
                  <td>${PRICES.four}</td>
                  <td>${priceFor(4, MAX_YEARS).total}</td>
                </tr>
                <tr>
                  <th scope="row">3 characters</th>
                  <td>${PRICES.three}</td>
                  <td>${priceFor(3, MAX_YEARS).total}</td>
                </tr>
                <tr>
                  <th scope="row">1 or 2 characters</th>
                  <td colSpan={2}>Not for sale</td>
                </tr>
              </tbody>
            </table>
            <p className="price-more__note">
              Pay for longer and save: 2 years cost 1.5 years&rsquo; price, and 5 years the same as 2. A name can
              be paid for up to 5 years ahead.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "What is a .hex name?",
    a: "A short, readable name like alice.hex that points to your wallet. People send to the name instead of copying your 0x… address.",
  },
  {
    q: "Which chains does it work on?",
    a: "PulseChain and Ethereum, for one price. Your name lives on PulseChain, where it's bought and managed, and is copied to Ethereum automatically, about 15 minutes after any change: a purchase, a renewal or a transfer. When Ethereum is unusually busy, a new name's or renewal's copy can wait for its fees to fall (see the next question). If you use both chains, or might one day, you're covered either way.",
  },
  {
    q: "Is there ever a fee to copy my name to Ethereum?",
    a: "Rarely, and only if you choose to pay it. Each copy costs Ethereum's network fee, and HexNS pays up to $2 of it, which covers it at Ethereum's usual prices. When Ethereum is unusually busy and a copy costs more, you choose when you buy or renew: let it copy free once Ethereum's fees fall (usually within hours), or pay the difference to copy it at once, shown as its own line before you pay. Sending a name to another wallet in the app pays it too, so the new owner shows on Ethereum at once. When Ethereum is extremely busy, you can copy it yourself instead, paying Ethereum's fee in ETH from your own wallet: choose it when you buy or renew, or do it from your name's page about 15 minutes after a change. That works however busy Ethereum gets. Your name works on PulseChain straight away either way.",
  },
  {
    q: `Why ${PRICE} a year?`,
    a: "It covers your name on both chains: on PulseChain, where it lives, and its copy on Ethereum, which costs gas to keep up to date.",
  },
  {
    q: "Which wallets will support it?",
    a: "We're bringing .hex to wallets, starting with a MetaMask Snap, then a library any wallet, explorer or app can use. Until yours supports .hex, keep using your 0x… address as normal.",
  },
  {
    q: "What can I pay with?",
    a: "Names are bought on PulseChain, with PLS, HEX or PLSX, or with USDC, USDT, DAI, WETH or HEX (eHEX) bridged from Ethereum. It's swapped into USDC at checkout, so the price stays in dollars. Holding another token? Swap it for PLS on PulseX first. Money on Ethereum or another chain? Send USDC with LibertySwap (libertyswap.finance), choosing PLS on PulseChain to receive: it arrives in a few minutes, for a 0.3% fee (send at least $10), and the PLS pays for your name and the network fee.",
  },
  {
    q: "Can I sell my name?",
    a: "Yes. Like a .eth name, each .hex name is an NFT, on PulseChain, where it lives. Sell it on a PulseChain NFT marketplace, which shows it as a card with its name and when it's paid until, and hands it over as the payment arrives. The buyer gets the time already paid for, and the copy on Ethereum follows them by itself (on its own, the copy can't be sold). HexNS takes no cut. Your name's page in the app has the details.",
  },
  {
    q: "What happens if I forget to renew?",
    a: "You get 28 days to renew. After that the name is released, and for 21 days its price starts very high and halves every day, so nobody can grab it the moment it lapses.",
  },
  {
    q: "Can anyone take my name?",
    a: "No. Nobody can take, move or redirect a name someone owns, including the HexNS team.",
  },
  {
    q: "Is alice.hex the same as alice.hex.eth?",
    a: "No. .hex names never end in .eth. alice.hex.eth is a different name that HexNS doesn't control, so always type a .hex name exactly as name.hex.",
  },
  {
    q: "Is it safe?",
    a: "HexNS is built on the code of ENS v2, which has been audited. HexNS's own contracts will be independently reviewed before launch.",
  },
  {
    q: "Is HexNS part of HEX or PulseChain?",
    a: "No. HexNS is an independent community project for Hexicans. It isn't run by, or affiliated with, HEX, PulseChain or ENS.",
  },
];

export function Faq() {
  return (
    <section className="section section--tint" id="faq" aria-labelledby="faq-title">
      <div className="container faq">
        <SectionHeading kicker="FAQ" title={<span id="faq-title">Questions, answered</span>} />
        <div className="faq__list">
          {FAQS.map((item) => (
            <details className="faq__item" key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="section section--tight" aria-labelledby="cta-title">
      <div className="container">
        <div className="cta">
          <h2 id="cta-title">Claim your name before someone else does</h2>
          <p>
            Every name exists once. Search for yours, buy it on PulseChain, and it&rsquo;s yours on both chains.
          </p>
          <div className="cta__actions">
            <a className="button button--primary" href="#top">
              Search for a name
            </a>
            <a className="button button--ghost" href={appUrl()}>
              Open the app
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
