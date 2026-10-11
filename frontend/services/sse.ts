/**
 * Real-time updates via Server-Sent Events (ADR-002 §8).
 *
 * EventSource cannot send an Authorization header, so we first obtain a
 * single-use 60s ticket via POST /stream/ticket, then open
 * `${base}/stream?ticket=...`. On error we close and reconnect with
 * exponential backoff (a fresh ticket each time).
 *
 * The app holds a single shared connection per signed-in user
 * (`acquireEventStream`), so one page load requests exactly one ticket — also
 * under React StrictMode's double-invoked effects in development.
 */
import type { QueryClient } from "@tanstack/react-query";
import { api, getApiBaseUrl } from "@/services/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import {
  invalidateForNewPost,
  invalidateForRepairUpdate,
  isKnownPost,
  isRepairStatusCurrent,
} from "@/lib/invalidation";
import { notificationSchema } from "@/features/notifications/schemas";
import type {
  Notification,
  PostCreatedEvent,
  PostType,
  RepairUpdatedEvent,
  StreamTicket,
} from "@/types/api";

export interface StreamHandlers {
  onNotification?: (n: Notification) => void;
  onPostCreated?: (e: PostCreatedEvent) => void;
  onRepairUpdated?: (e: RepairUpdatedEvent) => void;
  /** pin / unpin by a club account or an admin (ADR-003) */
  onPostUpdated?: (e: PostCreatedEvent) => void;
  onOpen?: () => void;
}

export interface StreamOptions {
  /** first retry delay (ms) */
  baseDelayMs?: number;
  /** cap for retry delay (ms) */
  maxDelayMs?: number;
}

function parse<T>(ev: MessageEvent): T | null {
  try {
    return JSON.parse(ev.data) as T;
  } catch {
    return null;
  }
}

/** Opens the stream; returns a disconnect function. */
export function connectEventStream(
  handlers: StreamHandlers,
  opts: StreamOptions = {},
): () => void {
  const baseDelay = opts.baseDelayMs ?? 1_000;
  const maxDelay = opts.maxDelayMs ?? 30_000;
  let source: EventSource | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  /** guards against overlapping ticket requests for this connection */
  let connecting = false;

  const scheduleReconnect = () => {
    if (stopped || timer) return;
    const delay =
      Math.min(maxDelay, baseDelay * 2 ** attempt) +
      Math.floor(Math.random() * 500);
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, delay);
  };

  async function connect() {
    if (stopped || connecting || source || typeof EventSource === "undefined")
      return;
    connecting = true;
    let ticket: string;
    try {
      ticket = (await api.post<StreamTicket>("/stream/ticket")).ticket;
    } catch {
      connecting = false;
      scheduleReconnect();
      return;
    }
    connecting = false;
    if (stopped) return;
    const es = new EventSource(
      `${getApiBaseUrl()}/stream?ticket=${encodeURIComponent(ticket)}`,
    );
    source = es;
    es.onopen = () => {
      attempt = 0;
      handlers.onOpen?.();
    };
    es.addEventListener("notification", (ev) => {
      const parsed = notificationSchema.safeParse(
        parse<unknown>(ev as MessageEvent),
      );
      if (parsed.success)
        handlers.onNotification?.(parsed.data as Notification);
    });
    es.addEventListener("post.created", (ev) => {
      const data = parse<PostCreatedEvent>(ev as MessageEvent);
      if (data) handlers.onPostCreated?.(data);
    });
    es.addEventListener("repair.updated", (ev) => {
      const data = parse<RepairUpdatedEvent>(ev as MessageEvent);
      if (data) handlers.onRepairUpdated?.(data);
    });
    es.addEventListener("post.updated", (ev) => {
      const data = parse<PostCreatedEvent>(ev as MessageEvent);
      if (data) handlers.onPostUpdated?.(data);
    });
    es.onerror = () => {
      // Tickets are single-use, so never let EventSource auto-retry with the old one.
      es.close();
      if (source === es) source = null;
      scheduleReconnect();
    };
  }

  void connect();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    source?.close();
    source = null;
  };
}

/* ------------------------------------------------------------------ */
/* Shared, idempotent connection                                        */
/* ------------------------------------------------------------------ */

interface SharedStream {
  key: string;
  refs: number;
  handlers: StreamHandlers;
  disconnect: () => void;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

let shared: SharedStream | null = null;

function closeShared() {
  if (!shared) return;
  if (shared.closeTimer) clearTimeout(shared.closeTimer);
  shared.disconnect();
  shared = null;
}

/**
 * Acquire the app-wide event stream for `key` (the signed-in user's id).
 * Repeated acquisitions for the same key share ONE connection — and therefore
 * one `POST /stream/ticket` — and the latest handlers receive the events.
 *
 * Release is deferred by a tick so React StrictMode's dev-only
 * mount → unmount → mount cycle re-uses the connection that is already
 * fetching its ticket instead of opening a second one. A different key
 * (another user signed in) closes the previous connection first.
 */
export function acquireEventStream(
  key: string,
  handlers: StreamHandlers,
  opts: StreamOptions = {},
): () => void {
  if (shared && shared.key !== key) closeShared();
  if (!shared) {
    const created: SharedStream = {
      key,
      refs: 0,
      handlers,
      disconnect: () => {},
      closeTimer: null,
    };
    created.disconnect = connectEventStream(
      {
        onOpen: () => created.handlers.onOpen?.(),
        onNotification: (n) => created.handlers.onNotification?.(n),
        onPostCreated: (e) => created.handlers.onPostCreated?.(e),
        onRepairUpdated: (e) => created.handlers.onRepairUpdated?.(e),
        onPostUpdated: (e) => created.handlers.onPostUpdated?.(e),
      },
      opts,
    );
    shared = created;
  }
  const entry = shared;
  if (entry.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  }
  entry.refs += 1;
  entry.handlers = handlers;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.refs -= 1;
    if (entry.refs > 0 || shared !== entry) return;
    entry.closeTimer = setTimeout(() => {
      if (shared === entry && entry.refs === 0) closeShared();
    }, 0);
  };
}

/** test helper: drop the shared connection immediately */
export function resetSharedEventStream() {
  closeShared();
}

/** Query invalidation rules for each SSE event type (see lib/invalidation.ts). */
export function invalidateForEvent(
  qc: QueryClient,
  event: "notification" | "post.created" | "post.updated" | "repair.updated",
  data?: { id?: number; type?: PostType; status?: string },
) {
  switch (event) {
    case "notification":
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      break;
    case "post.created":
      // this tab created it and already refreshed its lists
      if (data?.id !== undefined && isKnownPost(qc, data.id)) break;
      invalidateForNewPost(qc, data?.type ?? "general");
      break;
    case "post.updated":
      // pins change what the dashboard and the post show; refresh both
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      if (data?.id !== undefined) {
        void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(data.id), exact: true });
      }
      break;
    case "repair.updated":
      if (data?.id === undefined) break;
      // the cache already shows this status (e.g. this tab made the change itself)
      if (
        data.status !== undefined &&
        isRepairStatusCurrent(qc, data.id, data.status)
      )
        break;
      invalidateForRepairUpdate(qc, data.id);
      break;
  }
}
