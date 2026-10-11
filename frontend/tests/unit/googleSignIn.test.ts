import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeCodeForSupabaseToken,
  GoogleSignInError,
} from "@/services/googleSignIn";

describe("Google sign-in via Supabase Auth (PKCE)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co/");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("creates an RFC 7636 verifier and S256 challenge", async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it("builds the authorize URL for the Google provider with PKCE", () => {
    const url = new URL(buildAuthorizeUrl("CHALLENGE", "http://localhost:3000/auth/callback"));
    expect(url.origin + url.pathname).toBe("https://ref.supabase.co/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("code_challenge")).toBe("CHALLENGE");
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    expect(url.searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
    expect(url.searchParams.get("hd")).toBe("up.ac.th");
  });

  it("exchanges the code with the stored verifier using only the public key", async () => {
    sessionStorage.setItem("upboard.google.verifier", "VERIFIER");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "sb-token" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(exchangeCodeForSupabaseToken("CODE")).resolves.toBe("sb-token");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ref.supabase.co/auth/v1/token?grant_type=pkce");
    expect(JSON.parse(init.body as string)).toEqual({ auth_code: "CODE", code_verifier: "VERIFIER" });
    expect((init.headers as Record<string, string>).apikey).toBe("public-anon-key");
    expect(sessionStorage.getItem("upboard.google.verifier")).toBeNull(); // single use
  });

  it("refuses to exchange without a verifier (callback opened directly)", async () => {
    await expect(exchangeCodeForSupabaseToken("CODE")).rejects.toBeInstanceOf(GoogleSignInError);
  });
});
