"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";

/**
 * Debounced search box state mirrored into the URL `?q=` param (resets `page`).
 * `urlQ` is the committed term to send to the API.
 */
export function useUrlSearch({ enabled = true, delay = 350 }: { enabled?: boolean; delay?: number } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const debouncedQ = useDebounce(q.trim(), delay);

  useEffect(() => {
    if (!enabled || debouncedQ === urlQ) return;
    const next = new URLSearchParams(params.toString());
    if (debouncedQ) next.set("q", debouncedQ);
    else next.delete("q");
    next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedQ, urlQ, enabled, params, pathname, router]);

  return { q, setQ, urlQ };
}
