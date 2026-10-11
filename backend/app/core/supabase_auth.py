"""Verify Supabase Auth access tokens issued after Google sign-in (ADR-003).

The browser signs in with Google through Supabase Auth and sends the resulting Supabase access
token ONCE to `POST /auth/supabase`. Here we verify it ourselves (signature, issuer, audience,
expiry) and check the identity rules; the API then issues its own JWT + refresh cookie, so the
rest of the system never depends on Supabase sessions.

Accepted only when ALL hold:
* signed by the project (asymmetric keys from the project's JWKS endpoint, or — for projects still
  on the legacy shared secret — HS256 with SUPABASE_JWT_SECRET);
* `iss` = {SUPABASE_URL}/auth/v1, `aud` = "authenticated", not expired, not anonymous;
* signed in with the Google provider and Google reports the email as verified;
* Google reports the email as verified. The domain rule (exactly @up.ac.th, no
  substring/suffix tricks — see email_domain_allowed) is enforced by auth.google_sign_in,
  which also admits a pre-registered student_club account with any verified address.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt

from app.config import get_settings
from app.core.errors import AppError

ASYMMETRIC_ALGORITHMS = ["RS256", "ES256"]


@dataclass(frozen=True)
class SupabaseIdentity:
    user_id: str
    email: str
    full_name: str | None


def _rejected(message: str, code: str = "GOOGLE_ACCOUNT_REJECTED") -> AppError:
    return AppError(403, code, message)


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600, timeout=5)


def _decode(token: str) -> dict[str, Any]:
    settings = get_settings()
    base = settings.supabase_url.rstrip("/")
    options = {"require": ["exp", "iat", "sub", "aud", "iss"]}
    common = {"audience": "authenticated", "issuer": f"{base}/auth/v1", "options": options}
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") == "HS256":
            if not settings.supabase_jwt_secret:
                raise jwt.InvalidTokenError("HS256 tokens are not accepted")
            return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], **common)
        jwks = _jwks_client(f"{base}/auth/v1/.well-known/jwks.json")
        signing_key = jwks.get_signing_key_from_jwt(token)
        return jwt.decode(token, signing_key.key, algorithms=ASYMMETRIC_ALGORITHMS, **common)
    except jwt.ExpiredSignatureError as exc:
        raise AppError(401, "TOKEN_EXPIRED", "Google sign-in expired; please try again") from exc
    except (jwt.PyJWKClientError, jwt.InvalidTokenError) as exc:
        raise AppError(401, "UNAUTHENTICATED", "Invalid Google sign-in token") from exc


def email_domain_allowed(email: str, domain: str) -> bool:
    """Exact domain match on the part after the LAST '@' (rejects up.ac.th.evil.com,
    evil-up.ac.th, x@sub.up.ac.th, quoted local parts with '@', …)."""
    local, sep, host = email.strip().lower().rpartition("@")
    return bool(sep and local and host == domain.lower() and '"' not in local)


def verify_access_token(token: str) -> SupabaseIdentity:
    settings = get_settings()
    if not settings.google_login_enabled:
        raise AppError(503, "GOOGLE_LOGIN_DISABLED", "Google sign-in is not configured")
    claims = _decode(token)
    if claims.get("is_anonymous"):
        raise _rejected("Anonymous sessions are not allowed")
    app_meta = claims.get("app_metadata") or {}
    providers = app_meta.get("providers") or [app_meta.get("provider")]
    if "google" not in providers:
        raise _rejected("Please sign in with your Google @up.ac.th account")
    user_meta = claims.get("user_metadata") or {}
    email = str(claims.get("email") or user_meta.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise _rejected("Google did not return an email address")
    if user_meta.get("email_verified") is not True:
        raise _rejected("Google has not verified this email address")
    name = user_meta.get("full_name") or user_meta.get("name")
    return SupabaseIdentity(
        user_id=str(claims["sub"]),
        email=email,
        full_name=str(name).strip() if name else None,
    )
