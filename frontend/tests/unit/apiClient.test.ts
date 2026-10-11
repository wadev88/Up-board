import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, api, refreshSession, tokenStore } from "@/services/apiClient";

const BASE = "http://api.test/api/v1";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const tokenResponse = (token: string) => ({
  access_token: token,
  token_type: "bearer",
  expires_in: 900,
  user: { id: 1, email: "a@up.ac.th", display_name: "A", role: "student" },
});

function authHeader(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe("apiClient", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    tokenStore.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses NEXT_PUBLIC_API_URL and attaches the in-memory bearer token", async () => {
    tokenStore.set("access-1");
    fetchMock.mockResolvedValueOnce(json(200, { status: "ok" }));

    const res = await api.get<{ status: string }>("/health");

    expect(res).toEqual({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/health`);
    expect(authHeader(fetchMock.mock.calls[0])).toBe("Bearer access-1");
    expect((init as RequestInit).credentials).toBe("include");
  });

  it("does not attach a token when auth: false", async () => {
    tokenStore.set("access-1");
    fetchMock.mockResolvedValueOnce(json(200, []));
    await api.get("/faculties", undefined, { auth: false });
    expect(authHeader(fetchMock.mock.calls[0])).toBeUndefined();
  });

  it("serialises query params and skips empty values", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [], total: 0, page: 1, page_size: 20 }));
    await api.get("/posts", { q: "ห้องสมุด", mine: true, category: undefined, page: 2, type: "" });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/api/v1/posts");
    expect(url.searchParams.get("q")).toBe("ห้องสมุด");
    expect(url.searchParams.get("mine")).toBe("true");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.has("category")).toBe(false);
    expect(url.searchParams.has("type")).toBe(false);
  });

  it("on 401 calls POST /auth/refresh once (with cookies) and retries with the new token", async () => {
    tokenStore.set("expired");
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_EXPIRED", message: "expired" } }))
      .mockResolvedValueOnce(json(200, tokenResponse("fresh")))
      .mockResolvedValueOnce(json(200, { count: 3 }));

    const res = await api.get<{ count: number }>("/notifications/unread-count");

    expect(res).toEqual({ count: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1];
    expect(refreshUrl).toBe(`${BASE}/auth/refresh`);
    expect((refreshInit as RequestInit).method).toBe("POST");
    expect((refreshInit as RequestInit).credentials).toBe("include");
    expect(authHeader(fetchMock.mock.calls[2])).toBe("Bearer fresh");
    expect(tokenStore.get()).toBe("fresh");
  });

  it("does not loop: if the retry is still 401 it throws and clears the token", async () => {
    tokenStore.set("expired");
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "no" } }))
      .mockResolvedValueOnce(json(200, tokenResponse("fresh")))
      .mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "still no" } }));

    await expect(api.get("/auth/me")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(tokenStore.get()).toBeNull();
  });

  it("throws the original 401 when refresh fails", async () => {
    tokenStore.set("expired");
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_EXPIRED", message: "expired" } }))
      .mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "no session" } }));

    await expect(api.get("/dashboard")).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenStore.get()).toBeNull();
  });

  it("does not try to refresh on 401 from /auth/login", async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: "INVALID_CREDENTIALS", message: "bad" } }),
    );
    await expect(
      api.post("/auth/login", { email: "x@up.ac.th", password: "x" }, { auth: false }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one refresh request between concurrent 401s", async () => {
    tokenStore.set("expired");
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return json(200, tokenResponse("fresh"));
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === "Bearer fresh" ? json(200, { ok: true }) : json(401, { error: { code: "TOKEN_EXPIRED", message: "" } });
    });

    await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(refreshCalls).toBe(1);
  });

  it("maps the error envelope to ApiError (code, message, details, field errors)", async () => {
    fetchMock.mockResolvedValueOnce(
      json(422, {
        error: {
          code: "PROFANITY_DETECTED",
          message: "profanity",
          details: [{ field: "title", terms: ["xxx"] }],
        },
      }),
    );

    const err = (await apiFetch("/posts", { method: "POST", body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("PROFANITY_DETECTED");
    expect(err.message).toBe("profanity");
    expect(err.details).toEqual([{ field: "title", terms: ["xxx"] }]);
    expect(err.fieldErrors().title).toContain("xxx");
    expect(err.userMessage).toBe("พบคำไม่สุภาพในเนื้อหา กรุณาแก้ไข");
  });

  it("falls back to an HTTP-derived code for non-envelope errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 404, statusText: "Not Found" }));
    await expect(api.get("/posts/999")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("never shows the English status text for non-envelope errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 418, statusText: "I'm a teapot" }));
    const err = (await api.get("/posts").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.userMessage).not.toContain("teapot");
    expect(err.userMessage).toMatch(/[ก-๙]/);

    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    const err5 = (await api.get("/posts").catch((e: unknown) => e)) as ApiError;
    expect(err5.code).toBe("INTERNAL_ERROR");
    expect(err5.userMessage).not.toContain("Bad Gateway");
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.get("/dashboard")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("returns undefined for 204 responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.delete("/posts/1")).resolves.toBeUndefined();
  });

  it("sends FormData without a JSON content-type", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 1, url: "/files/x", mime_type: "image/png", size_bytes: 10 }));
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "image/png" }), "a.png");
    await api.post("/uploads", fd);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(fd);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("refreshSession resolves null when there is no session", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "" } }));
    await expect(refreshSession()).resolves.toBeNull();
  });
});

describe("ApiError messages", () => {
  it("repair cooldown (429) is explained with the retry time", () => {
    const e = new ApiError(429, "REPAIR_TOO_FAST", "too fast", [
      { field: "retry_at", message: "2026-10-05T06:03:00+00:00" },
    ]);
    expect(e.userMessage).toContain("2 นาที");
    expect(e.userMessage).toContain("13:03"); // Asia/Bangkok
  });

  it("posting too fast shows when posting is possible again", () => {
    const e = new ApiError(429, "POSTING_TOO_FAST", "too fast", [
      { field: "retry_at", message: "2026-10-05T06:03:00+00:00" },
    ]);
    expect(e.userMessage).toContain("13:03");
  });

  it("suspension shows the end time from the API", () => {
    const e = new ApiError(403, "POSTING_SUSPENDED", "suspended", [
      { field: "suspended_until", message: "2026-10-12T06:00:00+00:00" },
    ]);
    expect(e.userMessage).toContain("ถูกระงับการโพสต์ชั่วคราว");
    expect(e.userMessage).toContain("12 ต.ค.");
  });

  it("Google sign-in rejections are explained in Thai", () => {
    expect(new ApiError(403, "EMAIL_DOMAIN_NOT_ALLOWED", "x").userMessage).toContain("@up.ac.th");
    expect(new ApiError(403, "GOOGLE_ACCOUNT_REJECTED", "x").userMessage).toContain("ยืนยันแล้ว");
  });
});
