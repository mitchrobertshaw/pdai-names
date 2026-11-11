// Referral links: hexns.domains/?ref=alice or app.hexns.domains/?ref=alice, where alice is the
// referrer's .hex name. The name is remembered for 58 days in the visitor's browser and goes with
// their purchase to the registrar as its referral tag: keccak256 of the name, as ENSv2 ids names.
// Referrers are paid from the registrar's records, to whoever owns the name when they're paid.
//
// The launch offer: for the first 58 days after the launch date in src/deployment.ts, referrers earn
// 10% of what the buyers they bring pay. Purchases after that still carry their referral tag on-chain,
// but earn nothing unless a new offer says so.

import { ens_normalize } from "@adraffy/ens-normalize";

const KEY = "hexns-ref";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Referrers earn this share of what the buyers they bring pay, during the launch offer. */
export const REFERRAL_PERCENT = 10;
/** How long the launch offer runs, from the launch date: 30 days and 4 more weeks. */
export const LAUNCH_OFFER_DAYS = 58;
/** How long a visitor's browser remembers the referral link they came in on: as long as the offer. */
export const REMEMBER_DAYS = LAUNCH_OFFER_DAYS;
const REMEMBER_MS = REMEMBER_DAYS * DAY_MS;

/** The referrer's name from a ?ref= value, if it's a valid .hex name. */
export function referrerFrom(value: string | null): string | null {
  if (!value) return null;
  try {
    const label = ens_normalize(value.trim().replace(/\.hex$/i, ""));
    return label && !label.includes(".") && [...label].length >= 3 ? label : null;
  } catch {
    return null;
  }
}

/** Remembers a ?ref= in this page's address, and returns the referrer to credit, if any. */
export function captureReferral(now = Date.now()): string | null {
  try {
    const fromLink = referrerFrom(new URLSearchParams(window.location.search).get("ref"));
    if (fromLink) localStorage.setItem(KEY, JSON.stringify({ label: fromLink, at: now }));
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { label: string; at: number } | null;
    if (!saved || now - saved.at > REMEMBER_MS) return null;
    return referrerFrom(saved.label);
  } catch {
    return null; // storage blocked: only a link in the address counts
  }
}

/** A link that brings a visitor in on `label`'s referral. */
export function referralLink(label: string, base = "https://hexns.domains"): string {
  return `${base}/?ref=${encodeURIComponent(label)}`;
}

export interface LaunchOffer {
  /** The last day a referred purchase earns its referrer 10% (it ends at midnight UTC after it). */
  lastDay: Date;
  /** True until the offer is over. */
  open: boolean;
}

/** The launch offer for a network launched on `launchDate` ("YYYY-MM-DD"), or null without one. */
export function launchOffer(launchDate: string | undefined, now = Date.now()): LaunchOffer | null {
  if (!launchDate || !/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) return null;
  const start = Date.parse(`${launchDate}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const end = start + LAUNCH_OFFER_DAYS * DAY_MS;
  return { lastDay: new Date(end - DAY_MS), open: now < end };
}

const dayText = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** What a name's owner is told about their referral link. */
export function referralOfferText(offer: LaunchOffer | null): string {
  const earn = `when someone buys or renews a name through it, you earn ${REFERRAL_PERCENT}% of what they pay`;
  if (!offer) return `Share it. For the first ${LAUNCH_OFFER_DAYS} days after launch, ${earn}.`;
  if (offer.open) return `Share it. Until ${dayText(offer.lastDay)}, ${earn}.`;
  return `The launch offer, ${REFERRAL_PERCENT}% of what buyers paid through referral links, ended on ${dayText(offer.lastDay)}.`;
}
