// The name a visitor tries out in the demos down the page (the chat and the name card), shared so
// that typing it once shows it in both. "you" until they type one.
import { ens_normalize } from "@adraffy/ens-normalize";
import { useSyncExternalStore } from "react";

export const DEFAULT_PLAY_NAME = "you";

let current = DEFAULT_PLAY_NAME;
const listeners = new Set<() => void>();

/** The label to show for what the visitor typed: normalized, one word, or "you" if there's nothing. */
export function playLabel(input: string): string {
  const text = input.trim().replace(/\.hex$/i, "").replace(/\./g, "");
  if (!text) return DEFAULT_PLAY_NAME;
  try {
    return ens_normalize(text) || DEFAULT_PLAY_NAME;
  } catch {
    return text.toLowerCase().replace(/[^a-z0-9-]/g, "") || DEFAULT_PLAY_NAME;
  }
}

export function setPlayName(label: string) {
  if (label === current) return;
  current = label;
  listeners.forEach((listener) => listener());
}

export function usePlayName(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

const SEARCH_EVENT = "hexns:search";

/** Puts `name` in the search box at the top of the page and scrolls up to it. */
export function searchFor(name: string) {
  window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: name }));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}

/** Calls `handler` with each name `searchFor` is given. Returns a function that stops it. */
export function onSearchFor(handler: (name: string) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<string>).detail);
  window.addEventListener(SEARCH_EVENT, listener);
  return () => window.removeEventListener(SEARCH_EVENT, listener);
}
