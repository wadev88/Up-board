"use client";

import { useSyncExternalStore } from "react";

/**
 * `window.matchMedia(query).matches`, kept in sync. Returns `false` during SSR
 * and hydration (server snapshot), so content gated on it is opt-in on the client.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
