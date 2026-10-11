/**
 * Thin fetch wrapper for the UP Board API (docs/architecture/api-contract.md).
 *
 * - Base URL from NEXT_PUBLIC_API_URL.
 * - Access token is kept in memory only (module-level store, never localStorage).
 * - On 401 it calls POST /auth/refresh once (credentials: "include", the refresh
 *   token is an httpOnly cookie) and retries the original request.
 * - Error envelope `{ error: { code, message, details } }` → ApiError.
 */
import type { ApiErrorDetail, ApiErrorEnvelope, TokenResponse } from "@/types/api";
import { ERROR_MESSAGES } from "@/lib/constants";
import { formatDateTime, formatTime } from "@/lib/format";

const DEFAULT_API_URL = "http://localhost:8000/api/v1";

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  return raw.replace(/\/+$/, "");
}

/* ------------------------------------------------------------------ */
/* In-memory token store                                               */
/* ------------------------------------------------------------------ */

type TokenListener = (token: string | null) => void;
let accessToken: string | null = null;
const tokenListeners = new Set<TokenListener>();

export const tokenStore = {
  get: (): string | null => accessToken,
  set(token: string | null) {
    accessToken = token;
    tokenListeners.forEach((l) => l(token));
  },
  clear() {
    tokenStore.set(null);
  },
  subscribe(listener: TokenListener): () => void {
    tokenListeners.add(listener);
    return () => tokenListeners.delete(listener);
  },
};

/* ------------------------------------------------------------------ */
/* Session callbacks (wired by AuthProvider)                           */
/* ------------------------------------------------------------------ */

interface SessionHandlers {
  onRefreshed?: (res: TokenResponse) => void;
  onSessionExpired?: () => void;
}
let sessionHandlers: SessionHandlers = {};
export function setSessionHandlers(handlers: SessionHandlers) {
  sessionHandlers = handlers;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Thai, user-facing message. Prefers our translation of the code. */
  get userMessage(): string {
    const base = ERROR_MESSAGES[this.code] ?? (this.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    if (this.code === "POSTING_SUSPENDED") {
      const until = this.detail("suspended_until");
      return until ? `${base} โพสต์ได้อีกครั้ง ${formatDateTime(until)}` : base;
    }
    if (this.code === "POSTING_TOO_FAST" || this.code === "REPAIR_TOO_FAST") {
      const retry = this.detail("retry_at");
      const when = retry ? ` (ทำรายการได้อีกครั้ง ${formatTime(retry)})` : "";
      return `${base}${when}`;
    }
    return base;
  }

  /** `message` of the detail entry whose `field` is `field` (spam policy details). */
  detail(field: string): string | undefined {
    const found = this.details.find((d) => d.field === field);
    return typeof found?.message === "string" ? found.message : undefined;
  }

  /** Map VALIDATION_ERROR / PROFANITY_DETECTED details to field → message. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) {
      if (!d.field) continue;
      if (this.code === "PROFANITY_DETECTED") {
        const terms = Array.isArray(d.terms) && d.terms.length ? ` (${d.terms.join(", ")})` : "";
        out[d.field] = `พบคำไม่สุภาพ${terms} กรุณาแก้ไข`;
      } else {
        out[d.field] = d.message ?? "ข้อมูลไม่ถูกต้อง";
      }
    }
    return out;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** User-facing message for any thrown value. */
export function getErrorMessage(e: unknown): string {
  if (isApiError(e)) return e.userMessage;
  return "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่";
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  const env = body as Partial<ApiErrorEnvelope> | null;
  if (env && typeof env === "object" && env.error && typeof env.error.code === "string") {
    return new ApiError(
      res.status,
      env.error.code,
      env.error.message ?? res.statusText,
      Array.isArray(env.error.details) ? env.error.details : [],
    );
  }
  const fallbackCode =
    res.status === 401 ? "UNAUTHENTICATED"
    : res.status === 403 ? "FORBIDDEN"
    : res.status === 404 ? "NOT_FOUND"
    : res.status === 422 ? "VALIDATION_ERROR"
    : res.status === 429 ? "RATE_LIMITED"
    : res.status >= 500 ? "INTERNAL_ERROR"
    : "HTTP_ERROR";
  // Never surface the (English) HTTP status text to users.
  return new ApiError(res.status, fallbackCode, ERROR_MESSAGES[fallbackCode] ?? ERROR_MESSAGES.HTTP_ERROR);
}

/* ------------------------------------------------------------------ */
/* Refresh (single-flight)                                             */
/* ------------------------------------------------------------------ */

let refreshPromise: Promise<TokenResponse | null> | null = null;

async function doRefresh(): Promise<TokenResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      tokenStore.clear();
      return null;
    }
    const data = (await res.json()) as TokenResponse;
    tokenStore.set(data.access_token);
    sessionHandlers.onRefreshed?.(data);
    return data;
  } catch {
    return null;
  }
}

/**
 * POST /auth/refresh using the httpOnly cookie. Resolves null when there is no
 * valid session. Concurrent callers share one in-flight request.
 */
export function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON-serialisable body or FormData (multipart) */
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Attach bearer token and attempt refresh on 401 (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

/** Endpoints where a 401 means "bad credentials", not "expired token". */
const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
];

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body; // browser sets multipart boundary
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body,
    credentials: "include",
    signal: opts.signal,
  });
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, opts, tokenStore.get());
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK_ERROR", "Network error");
  }

  const canRefresh = opts.auth !== false && !NO_REFRESH_PATHS.some((p) => path.startsWith(p));
  if (res.status === 401 && canRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      try {
        res = await send(path, opts, refreshed.access_token);
      } catch {
        throw new ApiError(0, "NETWORK_ERROR", "Network error");
      }
    }
    if (res.status === 401) {
      tokenStore.clear();
      sessionHandlers.onSessionExpired?.();
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], opts?: Omit<RequestOptions, "query" | "method">) =>
    apiFetch<T>(path, { ...opts, query, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body" | "method">) =>
    apiFetch<T>(path, { ...opts, body, method: "POST" }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body" | "method">) =>
    apiFetch<T>(path, { ...opts, body, method: "PATCH" }),
  delete: <T = void>(path: string, opts?: Omit<RequestOptions, "method">) =>
    apiFetch<T>(path, { ...opts, method: "DELETE" }),
};
