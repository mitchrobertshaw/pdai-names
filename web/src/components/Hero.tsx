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
            <span className="eyebrow__more"> · Live on PulseChain and Ethereum</span>
          </span>
        </p>
        <h1 id="hero-title">
          Your <span className="grad-text">.hex</span> name on PulseChain and Ethereum
        </h1>
        <p className="lede">
          Swap your 0x… for yourname.hex. One name for your wallet, on PulseChain and Ethereum. Pay with PLS, HEX and more,
          on PulseChain.
        </p>
        <NameSearch />
        <LiveStrip />
      </div>
      <FloatingNames variant="marquee" />
    </section>
  );
}
