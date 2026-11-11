import { Logo } from "./Logo";

/** The pDAI Names lockup: the Coin mark, the wordmark, and "pDAI Name Service" in small type beneath. */
export function Brand({ href, label, tagline = true }: { href: string; label: string; tagline?: boolean }) {
  return (
    <a className="brand" href={href} aria-label={label}>
      <Logo height={tagline ? 34 : 30} />
      <span className="brand__text">
        <span className="brand__name">pDAI Names</span>
        {tagline ? <span className="brand__tagline">pDAI Name Service</span> : null}
      </span>
    </a>
  );
}
