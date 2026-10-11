"""Dashboard ordering (ADR-003, replacing the score of ADR-002 decision 4).

Sections: Pinned (≤ `pinned_display_limit`) → Upcoming events → Recent.
* Pinned: active pins only. When more posts are pinned than can be shown, a stable rotation picks
  which ones: the order is a hash of (time slot, post id), so it changes every
  `pin_rotation_minutes` and is identical for every viewer and every reload inside a slot.
* Upcoming events: not yet ended; priority University > Faculty > Department FIRST, then
  `starts_at` ascending, then id (stable tie-breaker).
* Recent: general posts (24 h) and announcements (7 days / related repair active), newest first.
* Repairs (active, priority then newest) and lost & found (7 days) have their own sections.
"""

import hashlib
from collections.abc import Iterable
from datetime import UTC, datetime

from app.config import get_settings
from app.core.permissions import EVENT_PRIORITY_RANK
from app.models import Post

_NEVER = datetime.max.replace(tzinfo=UTC)  # pins without an end sort last


def event_sort_key(post: Post) -> tuple[int, float, int]:
    event = post.event
    if event is None:  # only called for event posts, which always have details
        raise ValueError(f"post {post.id} has no event details")
    return (-EVENT_PRIORITY_RANK[event.priority_level], event.starts_at.timestamp(), post.id)


def recent_sort_key(post: Post) -> tuple[float, int]:
    return (-post.created_at.timestamp(), -post.id)


def rotation_slot(now: datetime) -> int:
    return int(now.timestamp() // (get_settings().pin_rotation_minutes * 60))


def _rotation_key(slot: int, post_id: int) -> bytes:
    return hashlib.sha256(f"{slot}:{post_id}".encode()).digest()


def pick_pinned(posts: Iterable[Post], now: datetime) -> list[Post]:
    """Up to `pinned_display_limit` pins, rotated per time slot, shown soonest-ending first (pins
    without an end last)."""
    limit = get_settings().pinned_display_limit
    candidates = list(posts)
    if len(candidates) > limit:
        slot = rotation_slot(now)
        candidates = sorted(candidates, key=lambda p: _rotation_key(slot, p.id))[:limit]
    return sorted(candidates, key=lambda p: (p.pinned_until or _NEVER, p.id))
