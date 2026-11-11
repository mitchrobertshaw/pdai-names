// The chains' own logos, shown where the site names the chains a .hex name works on. PulseChain's
// is the PLS mark from PulseX's token list (the same mark as pulsechain.com's icon); Ethereum's is
// eth-diamond-purple.svg from ethereum.org/assets. HexNS isn't affiliated with either.
import ethereum from "../assets/chains/ethereum.svg";
import pulsechain from "../assets/chains/pulsechain.png";

const LOGOS = { pulsechain, ethereum };

/** Decorative: the chain's name is always written next to it. */
export function ChainLogo({ chain, size = 40 }: { chain: keyof typeof LOGOS; size?: number }) {
  return <img className="chain-logo" src={LOGOS[chain]} alt="" width={size} height={size} />;
}
