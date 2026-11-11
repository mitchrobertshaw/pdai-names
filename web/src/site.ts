// Site-wide settings.

import { captureReferral } from "./lib/referral";

/** Which deployment this build shows (src/deployment.ts): set VITE_NETWORK=testnet for a testnet copy. */
export const NETWORK: "mainnet" | "testnet" = import.meta.env.VITE_NETWORK === "testnet" ? "testnet" : "mainnet";

/**
 * A page of the app, where names are bought and managed: app.hexns.domains on the live site. On a
 * preview link the app is the same files under /app; a copy opened from a file uses the live app.
 */
export function appUrl(path = "/"): string {
  const { hostname, origin, protocol } = window.location;
  // A visitor who came in on a referral link keeps it on the way to the app, a separate site.
  const referrer = captureReferral();
  const withRef = referrer ? `${path}${path.includes("?") ? "&" : "?"}ref=${encodeURIComponent(referrer)}` : path;
  if (protocol === "file:" || /(^|\.)hexns\.domains$/.test(hostname)) return `https://app.hexns.domains${withRef}`;
  return `${origin}/app${withRef}`;
}
