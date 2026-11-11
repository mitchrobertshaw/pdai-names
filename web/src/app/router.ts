// The app's pages: "/" to search, "/alice.hex" for a name, "/names" for the names you own, and
// "/referrals" for the referral payout report and "/admin" for the admin's powers (neither in the menu).
//
// On app.hexns.domains they sit at the root; on a preview link, under /app. Anywhere else (a copy
// opened from a file, or inside another page) they go after a # instead.

import { useSyncExternalStore } from "react";

export type Route =
  | { page: "search" }
  | { page: "name"; label: string }
  | { page: "names" }
  | { page: "referrals" }
  | { page: "admin" };

export interface Place {
  pathname: string;
  hash: string;
  hostname: string;
  protocol: string;
}

/** How this copy of the app addresses its pages. */
export function modeOf(place: Place): { base: string; hash: boolean } {
  if (place.protocol === "file:") return { base: "", hash: true };
  if (place.hostname === "app.hexns.domains") return { base: "", hash: false };
  if (place.pathname === "/app" || place.pathname.startsWith("/app/")) return { base: "/app", hash: false };
  return { base: "", hash: true };
}

export function parse(place: Place): Route {
  const mode = modeOf(place);
  const raw = mode.hash ? place.hash.replace(/^#/, "") : place.pathname.slice(mode.base.length);
  const path = decodeURIComponent(raw.replace(/\/+$/, "")) || "/";
  if (path === "/names") return { page: "names" };
  if (path === "/referrals") return { page: "referrals" };
  if (path === "/admin") return { page: "admin" };
  const name = /^\/([^/]+)\.hex$/i.exec(path);
  if (name) return { page: "name", label: name[1].toLowerCase() };
  return { page: "search" };
}

export function pathOf(route: Route): string {
  if (route.page === "names") return "/names";
  if (route.page === "referrals") return "/referrals";
  if (route.page === "admin") return "/admin";
  if (route.page === "name") return `/${encodeURIComponent(route.label)}.hex`;
  return "/";
}

/** The link for a page, in this copy's style. */
export function hrefOf(route: Route, place: Place = window.location): string {
  const mode = modeOf(place);
  return mode.hash ? `#${pathOf(route)}` : `${mode.base}${pathOf(route)}`;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
let listening = false;

export function navigate(route: Route) {
  const href = hrefOf(route);
  if (href.startsWith("#")) window.location.hash = href.slice(1);
  else window.history.pushState(null, "", href);
  notify();
  window.scrollTo({ top: 0 });
}

let current: Route | null = null;
function snapshot(): Route {
  const next = parse(window.location);
  if (!current || JSON.stringify(next) !== JSON.stringify(current)) current = next;
  return current;
}

function subscribe(listener: () => void) {
  if (!listening) {
    window.addEventListener("popstate", notify);
    window.addEventListener("hashchange", notify);
    listening = true;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot);
}

/** A link to a page of the app that changes page without reloading. */
export function linkProps(route: Route) {
  return {
    href: hrefOf(route),
    onClick(event: { preventDefault(): void; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; button: number }) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return; // new tab etc.
      event.preventDefault();
      navigate(route);
    },
  };
}
