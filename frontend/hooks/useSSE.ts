"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { acquireEventStream, invalidateForEvent, type StreamHandlers } from "@/services/sse";
import { useAuth } from "@/hooks/useAuth";

/**
 * Keeps one SSE connection open while authenticated and invalidates the
 * relevant TanStack queries on `notification`, `post.created`, `repair.updated`.
 *
 * The effect depends on the signed-in user's id only — not on the user object
 * or the access token, which change on every silent refresh — and the
 * connection itself is shared and idempotent (services/sse.ts), so a page load
 * requests exactly one stream ticket.
 */
export function useSSE(extra: Pick<StreamHandlers, "onNotification"> = {}) {
  const qc = useQueryClient();
  const { status, user } = useAuth();
  const userKey = status === "authenticated" && user ? String(user.id) : null;
  const extraRef = useRef(extra);
  useEffect(() => {
    extraRef.current = extra;
  });

  useEffect(() => {
    if (!userKey) return;
    return acquireEventStream(userKey, {
      onNotification: (n) => {
        invalidateForEvent(qc, "notification");
        extraRef.current.onNotification?.(n);
      },
      onPostCreated: (e) => invalidateForEvent(qc, "post.created", e),
      onRepairUpdated: (e) => invalidateForEvent(qc, "repair.updated", e),
      onPostUpdated: (e) => invalidateForEvent(qc, "post.updated", e),
    });
  }, [qc, userKey]);
}
