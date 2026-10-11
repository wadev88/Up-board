/**
 * Google sign-in through Supabase Auth (ADR-003), OAuth 2.0 authorization-code + PKCE.
 *
 * Only two Supabase Auth endpoints are needed, so this talks to them with fetch instead of
 * adding @supabase/supabase-js:
 *   1. /auth/v1/authorize?provider=google → Google → back to /auth/callback?code=…
 *   2. /auth/v1/token?grant_type=pkce     → Supabase access token
 * The access token is then sent ONCE to our API (POST /auth/supabase), which verifies it and
 * enforces "verified @up.ac.th only" before issuing its own session. The Supabase session is
 * dropped right away (/auth/v1/logout) — the app never keeps or reuses it.
 *
 * Only the PUBLIC anon / publishable key is used here. The service_role key never belongs in
 * the frontend.
 */

const VERIFIER_KEY = "upboard.google.verifier";
const NEXT_KEY = "upboard.google.next";

function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
}

function anonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

/** True when the build has the public Supabase settings (the API also reports its own). */
export function googleSignInConfigured(): boolean {
  return !!supabaseUrl() && !!anonKey();
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** Build the Supabase authorize URL (exported for tests). */
export function buildAuthorizeUrl(challenge: string, redirectTo: string): string {
  const url = new URL(`${supabaseUrl()}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "s256");
  url.searchParams.set("scopes", "openid email profile");
  // UX hints for Google's account chooser; the domain is ENFORCED by our API, not by these
  url.searchParams.set("hd", "up.ac.th");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Step 1: redirect the browser to Google (via Supabase Auth). */
export async function startGoogleSignIn(next: string): Promise<void> {
  const { verifier, challenge } = await createPkcePair();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(NEXT_KEY, next);
  window.location.assign(buildAuthorizeUrl(challenge, `${window.location.origin}/auth/callback`));
}

export class GoogleSignInError extends Error {}

/** Step 2 (on /auth/callback): trade the one-time code for a Supabase access token. */
export async function exchangeCodeForSupabaseToken(code: string): Promise<string> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier) throw new GoogleSignInError("missing_verifier");
  const res = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: anonKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (!res.ok) throw new GoogleSignInError(`token_exchange_${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new GoogleSignInError("no_access_token");
  return body.access_token;
}

/** Drop the Supabase session (best effort): our API issues its own session instead. */
export async function discardSupabaseSession(accessToken: string): Promise<void> {
  try {
    await fetch(`${supabaseUrl()}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: anonKey(), Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* ignore — the token expires on its own and is never stored */
  }
}

/** Where to go after sign-in (stored before leaving for Google). */
export function takeNextPath(): string | null {
  const next = sessionStorage.getItem(NEXT_KEY);
  sessionStorage.removeItem(NEXT_KEY);
  return next;
}
