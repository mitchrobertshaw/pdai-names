import { Logo } from "./Logo";

/** The HexNS lockup: the Route mark, the wordmark, and "HEX Name Service" in small type beneath. */
export function Brand({ href, label, tagline = true }: { href: string; label: string; tagline?: boolean }) {
  return (
    <a className="brand" href={href} aria-label={label}>
      <Logo height={tagline ? 34 : 30} />
      <span className="brand__text">
        <span className="brand__name">HexNS</span>
        {tagline ? <span className="brand__tagline">HEX Name Service</span> : null}
      </span>
    </a>
  );
}
