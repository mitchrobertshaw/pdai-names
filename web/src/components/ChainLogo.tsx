// PulseChain's own logo, shown where the site says where a .pdai name lives: the PLS mark from
// PulseX's token list (the same mark as pulsechain.com's icon). pDAI Names isn't affiliated with
// PulseChain.
import pulsechain from "../assets/chains/pulsechain.png";

const LOGOS = { pulsechain };

/** Decorative: the chain's name is always written next to it. */
export function ChainLogo({ chain, size = 40 }: { chain: keyof typeof LOGOS; size?: number }) {
  return <img className="chain-logo" src={LOGOS[chain]} alt="" width={size} height={size} />;
}
