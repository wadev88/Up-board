"""Post lifecycle rules (ADR-002 decision 3, revised by ADR-003 and the 2026-10 change set). Pure
functions over a given `now` so they are deterministic in tests and never depend on the
background job having run.

* General post: in the active feeds for [created_at, created_at + 24h). Afterwards it only leaves
  the feeds — it stays in the owner's Post History (no status change, no deletion).
* Announcement: in the feeds for 7 days, or for as long as its related repair is active.
* Event: active until `ends_at` (legacy rows without an end: until `starts_at`). Ended events
  never appear in upcoming lists; they stay in the owner's history.
* Repair: never expires by time; `closed` / `rejected` leave the active repair list.
* Lost & found: `returned` leaves the list at once; every other item is visible for 7 days from
  `created_at` (edits never reset it) and is then archived (soft-deleted by the worker, hidden at
  query time even if the job is late). Archived items stay in the owner's history.
* Pin (events + announcements only): the author picks 6/12/24/48/72 hours (default 48); an event
  pin never outlives the event start; an announcement pinned for a repair stays pinned until that
  repair is closed / rejected.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from app.config import get_settings
from app.core.errors import AppError
from app.models import (
    ACTIVE_REPAIR_STATUSES,
    LostFoundStatus,
    Post,
    PostStatus,
    PostType,
    RemovalReason,
)

Lifecycle = Literal["active", "expired", "resolved", "archived", "removed"]
GENERAL_WINDOW_TYPES = (PostType.general,)
PIN_HOUR_CHOICES = (6, 12, 24, 48, 72)


def dashboard_expires_at(created_at: datetime) -> datetime:
    """End of the 24 h dashboard window of a general post."""
    return created_at + timedelta(hours=get_settings().dashboard_window_hours)


def feed_expires_at(post: Post) -> datetime:
    """When the post leaves the active feeds on age alone (events / repairs: see lifecycle)."""
    settings = get_settings()
    if post.type is PostType.announcement:
        return post.created_at + timedelta(days=settings.announcement_window_days)
    if post.type is PostType.lost_found:
        return post.created_at + timedelta(days=settings.lost_found_archive_days)
    return dashboard_expires_at(post.created_at)


def is_within_dashboard_window(created_at: datetime, now: datetime) -> bool:
    return created_at <= now < dashboard_expires_at(created_at)


def event_end(starts_at: datetime, ends_at: datetime | None) -> datetime:
    """Legacy events without `ends_at` are treated as ending when they start (ADR-003)."""
    return ends_at or starts_at


def is_event_active(starts_at: datetime, ends_at: datetime | None, now: datetime) -> bool:
    return event_end(starts_at, ends_at) > now


def is_pinned(pinned_at: datetime | None, pinned_until: datetime | None, now: datetime) -> bool:
    """`pinned_until` None = pinned until the related repair ends (cleared by the repair flow)."""
    return (
        pinned_at is not None and pinned_at <= now and (pinned_until is None or now < pinned_until)
    )


def lost_found_archive_cutoff(now: datetime) -> datetime:
    return now - timedelta(days=get_settings().lost_found_archive_days)


def repair_is_active(post: Post | None) -> bool:
    return bool(post and post.repair is not None and post.repair.status in ACTIVE_REPAIR_STATUSES)


def post_lifecycle(post: Post, now: datetime, related_repair_active: bool = False) -> Lifecycle:
    if post.status is PostStatus.removed:
        return "archived" if post.removal_reason is RemovalReason.lost_found_expired else "removed"
    if post.type is PostType.general:
        return "active" if is_within_dashboard_window(post.created_at, now) else "expired"
    if post.type is PostType.announcement:
        if related_repair_active or now < feed_expires_at(post):
            return "active"
        return "expired"
    if post.type is PostType.event and post.event is not None:
        active = is_event_active(post.event.starts_at, post.event.ends_at, now)
        return "active" if active else "expired"
    if post.type is PostType.repair and post.repair is not None:
        return "active" if post.repair.status in ACTIVE_REPAIR_STATUSES else "resolved"
    if post.type is PostType.lost_found and post.lost_found is not None:
        if post.lost_found.status is LostFoundStatus.returned:
            return "resolved"
        if post.created_at <= lost_found_archive_cutoff(now):
            return "archived"
    return "active"


@dataclass(frozen=True)
class PinWindow:
    pinned_at: datetime
    pinned_until: datetime | None  # None: stays pinned until the related repair ends


def _pin_not_eligible(message: str) -> AppError:
    return AppError(409, "PIN_NOT_ELIGIBLE", message)


def compute_pin(
    post: Post,
    now: datetime,
    hours: int | None = None,
    related_repair_active: bool | None = None,
) -> PinWindow:
    """Window of a new pin, or 409 when the post can no longer be pinned.

    `related_repair_active` is only consulted for announcements with `related_repair_id`:
    None / False means the repair is already over."""
    if post.type not in (PostType.event, PostType.announcement):
        raise _pin_not_eligible("Only events and announcements can be pinned")
    hours = hours if hours is not None else get_settings().pin_default_hours
    if hours not in PIN_HOUR_CHOICES:
        raise AppError(422, "VALIDATION_ERROR", f"hours must be one of {list(PIN_HOUR_CHOICES)}")
    if post.type is PostType.event:
        starts_at = post.event.starts_at  # type: ignore[union-attr]
        if starts_at <= now:
            raise _pin_not_eligible("Events can only be pinned before they start")
        return PinWindow(pinned_at=now, pinned_until=min(now + timedelta(hours=hours), starts_at))
    if post.related_repair_id is not None:
        if not related_repair_active:
            raise _pin_not_eligible("The related repair is already closed")
        return PinWindow(pinned_at=now, pinned_until=None)
    if feed_expires_at(post) <= now:
        raise _pin_not_eligible("This announcement has left the feed and can no longer be pinned")
    return PinWindow(pinned_at=now, pinned_until=now + timedelta(hours=hours))
