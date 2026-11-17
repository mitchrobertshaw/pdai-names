import type { ReactNode } from "react";

import pdaiToken from "../assets/tokens/pdai.svg";
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

const TOKENS = ["PLS", "HEX", "PLSX", "eHEX", "WETH", "USDC", "USDT", "DAI"];

export function Features() {
  return (
    <section className="section" aria-labelledby="features-title">
      <div className="container">
        <SectionHeading kicker="What you get" title={<span id="features-title">A name made for pDAI holders</span>} />
        <div className="bento">
          <article className="card bento__item bento__item--wide">
            <div className="bento__art art-pay" aria-hidden="true">
              <img className="art-pay__coin" src={pdaiToken} alt="" width={56} height={56} />
              <span className="art-pay__wire" />
              <span className="art-pay__name">
                <span>
                  you<span className="grad-text">.pdai</span>
                </span>
                <small>From {PRICE} a year</small>
              </span>
              <span className="art-pay__wire" />
              <ChainLogo chain="pulsechain" size={56} />
            </div>
            <div className="bento__text">
              <h3>Pay with pDAI</h3>
              <p>
                Pay with the pDAI in your wallet. It&rsquo;s swapped at its PulseX price when you pay, so a name costs the
                same in dollars whatever pDAI is doing, and you see exactly how much pDAI before you confirm.
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
              <h3>Or the rest of your bag</h3>
              <p>
                PLS, HEX, eHEX, PLSX, WETH, USDC, USDT or DAI, on PulseChain. Holding something else? Swap it for PLS on
                PulseX first.
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
                <span className="art-code__comment">{"// wallets look up .pdai like .eth"}</span>
                <span>
                  <span className="art-code__fn">lookup</span>(
                  <span className="art-code__str">&quot;you.pdai&quot;</span>)
                </span>
                <span className="art-code__out">→ 0x7a3F…91c2</span>
              </span>
            </div>
            <div className="bento__text">
              <h3>Built on ENS v2</h3>
              <p>
                Made from the open-source code of the next version of ENS, so wallets and apps can add .pdai with lookups
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
    text: `Find a name you like. Names of 5 characters or more are ${PRICE} a year.`,
  },
  {
    title: "Pay on PulseChain",
    text: "Reserve it and wait a minute, so nobody can grab it first. Then pay with pDAI, PLS, HEX, PLSX, eHEX, WETH, USDC, USDT or DAI, with network fees of a fraction of a cent.",
  },
  {
    title: "Share it",
    text: "It’s yours in a couple of minutes, and points to your wallet straight away. Give people yourname.pdai instead of your address.",
  },
];

export function HowItWorks() {
  return (
    <section className="section section--tint" id="how" aria-labelledby="how-title">
      <div className="container">
        <SectionHeading kicker="How it works" title={<span id="how-title">Three steps to yourname.pdai</span>}>
          Your .pdai name lives on PulseChain, where it&rsquo;s bought, renewed and managed.
        </SectionHeading>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li className="card step" key={step.title}>
              <span className="step__number">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="how__extra">
          New to PulseChain? <AddPulseChain />
          <span>Money on another chain? LibertySwap brings it over in minutes.</span>
        </p>
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
          <h2 id="pricing-title">One simple price</h2>
          <p className="section__intro">One yearly price in dollars, whatever you pay with.</p>
          <ul className="ticks">
            <li>
              <CheckIcon size={18} /> Pay in pDAI, PLS, HEX, eHEX, PLSX, WETH, USDC, USDT or DAI
            </li>
            <li>
              <CheckIcon size={18} /> 5 years for the price of 2
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
          <p className="price__for">for names of 5 characters or more</p>
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
              <caption className="visually-hidden">Yearly price by name length</caption>
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
    q: "What is a .pdai name?",
    a: "A short, readable name like alice.pdai that points to your wallet. People send to the name instead of copying your 0x… address.",
  },
  {
    q: "Which chain does it work on?",
    a: "PulseChain. Your name lives there: it's bought, renewed and managed on PulseChain, and every change shows up straight away. It isn't copied to Ethereum or any other chain.",
  },
  {
    q: "Can I pay with pDAI?",
    a: "Yes. pDAI, the DAI copied when PulseChain launched, is swapped into USDC at checkout at its price on PulseX, so a name costs the same in dollars whatever pDAI is trading at. The app shows exactly how much pDAI it takes before you pay.",
  },
  {
    q: "What else can I pay with?",
    a: "PLS, HEX or PLSX, or USDC, USDT, DAI, WETH or HEX (eHEX) bridged from Ethereum. It's all swapped into USDC at checkout, so the price stays in dollars. Holding another token? Swap it for PLS on PulseX first. Money on Ethereum or another chain? Send USDC with LibertySwap (libertyswap.finance), choosing PLS on PulseChain to receive: it arrives in a few minutes, for a 0.3% fee (send at least $10), and the PLS pays for your name and the network fee.",
  },
  {
    q: "Which wallets will support it?",
    a: "We're bringing .pdai to wallets, starting with a MetaMask Snap, then a library any wallet, explorer or app can use. Until yours supports .pdai, keep using your 0x… address as normal.",
  },
  {
    q: "Can I sell my name?",
    a: "Yes. Like a .eth name, each .pdai name is an NFT, on PulseChain. Sell it on a PulseChain NFT marketplace, which shows it as a card with its name and when it's paid until, and hands it over as the payment arrives. The buyer gets the time already paid for. pDAI Names takes no cut. Your name's page in the app has the details.",
  },
  {
    q: "What happens if I forget to renew?",
    a: "You get 28 days to renew. After that the name is released, and for 21 days its price starts very high and halves every day, so nobody can grab it the moment it lapses.",
  },
  {
    q: "Can anyone take my name?",
    a: "No. Nobody can take, move or redirect a name someone owns, including the pDAI Names team.",
  },
  {
    q: "Is alice.pdai the same as alice.pdai.eth?",
    a: "No. .pdai names never end in .eth. alice.pdai.eth would be a different name, on ENS, so always type a .pdai name exactly as name.pdai.",
  },
  {
    q: "Is it safe?",
    a: "pDAI Names is built on the code of ENS v2, which has been audited. pDAI Names' own contracts will be independently reviewed before launch.",
  },
  {
    q: "Is pDAI Names part of pDAI or PulseChain?",
    a: "No. pDAI Names is an independent community project for the pDAI community. It isn't run by, or affiliated with, PulseChain, MakerDAO (now Sky), which made the original DAI, or ENS.",
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
          <h2 id="cta-title">Claim your .pdai name before someone else does</h2>
          <p>Every name exists once. Search for yours, pay with pDAI or PLS on PulseChain, and it&rsquo;s yours.</p>
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
