import type { CSSProperties } from "react";

import { Logo } from "./Logo";

/** The lockup: the Echo mark, with "pDAI Name Service" in white to its right. */
export function Brand({ href, label, size = 18 }: { href: string; label: string; size?: number }) {
  return (
    <a className="brand" href={href} aria-label={label} style={{ "--brand-size": `${size}px` } as CSSProperties}>
      <Logo height={Math.round(size * 1.55)} />
      <span className="brand__name">
        <b>pDAI</b> Name Service
      </span>
    </a>
  );
}
