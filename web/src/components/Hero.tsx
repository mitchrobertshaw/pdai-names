import { FloatingNames } from "./FloatingNames";
import { LiveStrip } from "./LiveStrip";
import { NameSearch } from "./NameSearch";

export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <FloatingNames variant="scatter" />
      <div className="container hero__content">
        <p className="eyebrow">
          <span className="eyebrow__dot" aria-hidden="true" />
          <span>
            Built on <b>ENSv2</b>
            <span className="eyebrow__more"> · Made for PulseChain</span>
          </span>
        </p>
        <h1 id="hero-title">
          Your <span className="grad-text">.pdai</span> name on PulseChain
        </h1>
        <p className="lede">
          Swap your 0x… for yourname.pdai: one short name for your wallet, bought and kept on PulseChain. Pay with pDAI,
          PLS, HEX and more.
        </p>
        <NameSearch />
        <LiveStrip />
      </div>
      <FloatingNames variant="marquee" />
    </section>
  );
}
