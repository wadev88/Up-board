"""Password hashing (Argon2, ADR-001), JWT access tokens and opaque refresh tokens."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import get_settings
from app.core.clock import utcnow

# OWASP Password Storage Cheat Sheet minimum for Argon2id: m=19 MiB, t=2, p=1.
# The library default (64 MiB, t=3, p=4) took 250–1300 ms per login on the test machine and would
# need GBs of RAM for a burst of concurrent campus logins on a 512 MB instance. Older hashes are
# still verified and are upgraded transparently on the next login (password_needs_rehash).
_hasher = PasswordHasher(time_cost=2, memory_cost=19 * 1024, parallelism=1)
# Used to keep login timing similar whether or not the email exists.
_DUMMY_HASH = _hasher.hash("upboard-dummy-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode(claims: dict[str, Any], ttl: timedelta) -> tuple[str, datetime]:
    settings = get_settings()
    now = utcnow()
    expires_at = now + ttl
    payload = {**claims, "iat": now, "exp": expires_at, "jti": str(uuid.uuid4())}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), expires_at


def create_access_token(user_id: int, role: str, token_version: int) -> tuple[str, int]:
    settings = get_settings()
    ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    token, _ = _encode(
        {"sub": str(user_id), "role": role, "tv": token_version, "typ": "access"}, ttl
    )
    return token, int(ttl.total_seconds())


def create_stream_ticket(user_id: int) -> tuple[str, str, int]:
    settings = get_settings()
    ttl = timedelta(seconds=settings.stream_ticket_ttl_seconds)
    token, _ = _encode({"sub": str(user_id), "typ": "stream"}, ttl)
    jti = decode_token(token, "stream")["jti"]
    return token, jti, settings.stream_ticket_ttl_seconds


class TokenError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub", "typ", "jti"]},
            leeway=0,
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("TOKEN_EXPIRED") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("UNAUTHENTICATED") from exc
    if payload.get("typ") != expected_type:
        raise TokenError("UNAUTHENTICATED")
    return payload
