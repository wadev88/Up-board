"use client";

import { useEffect, useState } from "react";

interface UseNowOptions {
  /** tick interval (ms), default 60s */
  intervalMs?: number;
  /** when false no timer runs (e.g. the parent already passes a shared clock) */
  enabled?: boolean;
}

/** Current time (ms) that re-renders every `intervalMs` — for countdowns. */
export function useNow({ intervalMs = 60_000, enabled = true }: UseNowOptions = {}): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}
