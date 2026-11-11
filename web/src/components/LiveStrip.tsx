import { useEffect, useMemo, useState } from "react";

import { type LiveStats, SHOW_DAY_FROM, SHOW_NAMES_FROM, timeAgo } from "../lib/stats";
import { NETWORK } from "../site";

/** The live numbers from the stats function, refreshed every minute; null until there are some. */
export function useLiveStats(): LiveStats | null {
  const [stats, setStats] = useState<LiveStats | null>(null);
  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const response = await fetch(`/api/stats?network=${NETWORK}`);
        if (!response.ok) return;
        const body = (await response.json()) as LiveStats | { live: false };
        if (!stopped) setStats(body.live ? body : null);
      } catch {
        // No stats (not deployed yet, or opened from a file): the strip stays hidden.
      }
    }
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);
  return stats;
}

/**
 * Under the search: "● LIVE · 1,234 names registered · alice.hex registered 2 min ago · 56 in the
 * last 24 hours", straight from the .hex registry on PulseChain. The latest names take turns.
 * Counts only show once they are worth showing; nothing shows until the contracts are live.
 */
export function LiveStrip() {
  const stats = useLiveStats();
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [turn, setTurn] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const latest = stats?.latest ?? [];

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (latest.length < 2 || reduced) return;
    const timer = window.setInterval(() => setTurn((t) => t + 1), 4000);
    return () => window.clearInterval(timer);
  }, [latest.length, reduced]);

  if (!stats) return null;
  const current = latest.length ? latest[turn % latest.length] : null;
  const showNames = stats.names >= SHOW_NAMES_FROM;
  const showDay = stats.last24h >= SHOW_DAY_FROM;
  if (!current && !showNames && !showDay) return null;

  return (
    <ul className="live" aria-label="Live from PulseChain">
      <li className="live__badge">
        <span className="live__dot" aria-hidden="true" />
        Live
      </li>
      {showNames ? (
        <li className="live__item">
          <b>{stats.names.toLocaleString("en")}</b> names registered
        </li>
      ) : null}
      {current ? (
        <li className="live__item live__item--latest" key={`${current.label}-${current.at}`}>
          <b className="live__name">
            {current.label}
            <span>.hex</span>
          </b>{" "}
          registered {timeAgo(current.at, now)}
        </li>
      ) : null}
      {showDay ? (
        <li className="live__item live__item--day">
          <b>{stats.last24h.toLocaleString("en")}</b> in the last 24 hours
        </li>
      ) : null}
    </ul>
  );
}
