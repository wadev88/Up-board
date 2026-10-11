"""Small in-process sliding-window rate limiter.

Campus users share a few NAT / Wi-Fi egress IPs, so per-IP limits must be generous: they only
stop floods. Abuse of a specific account or action is limited per account / per user instead
(see `enforce`).
Per-process only — sufficient for the single-instance deployment in ADR-001; move to a shared
store if the API is scaled horizontally (ADR-001 review trigger)."""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request

from app.config import get_settings
from app.core.errors import AppError


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            while bucket and now - bucket[0] > window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def enforce(key: str, limit: int, window_seconds: int = 60) -> None:
    """Raise 429 when `key` (e.g. "login:<ip>:<email>" or "upload:<user_id>") exceeds the limit."""
    if get_settings().rate_limit_enabled and not limiter.hit(key, limit, window_seconds):
        raise AppError(429, "RATE_LIMITED", "Too many requests, please try again later")


def rate_limit(name: str, limit: int, window_seconds: int = 60) -> Callable[[Request], None]:
    """Per-IP flood protection as a route dependency."""

    def dependency(request: Request) -> None:
        enforce(f"{name}:{client_ip(request)}", limit, window_seconds)

    return dependency
