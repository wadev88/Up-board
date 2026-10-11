"""Posting spam policy (replaces the ADR-003 window rule).

* Only `general` posts are counted. The count is the number of CONSECUTIVE general posts of the
  user inside the current Asia/Bangkok calendar day (00:00-23:59), including the post just
  created. Any non-general post by the user (any type, any status) in between ends the series.
  Soft-deleted posts still count. Posts before the end (`ends_at`, or `lifted_at` when an admin
  lifted it) of the user's latest suspension are ignored, so a new series starts after it.
* 3rd post of a series -> warning notification (the post is still created).
  5th -> suspended for 1 Bangkok calendar day (there is no longer tier). The post that hits the
  threshold is saved first, then the suspension starts immediately.
* Suspension in calendar days: the day it starts is day 1 and `ends_at` is 00:00 Bangkok of
  (start day + N), e.g. 10 Oct + 1 day -> restored 11 Oct 00:00. `last_day` is the last
  suspended date.
* While suspended the user cannot create ANY post type (403 POSTING_SUSPENDED) but can read,
  view profiles and use their history.

Concurrency: the user's row is locked (SELECT ... FOR UPDATE) for the rest of the creating
transaction, so two simultaneous requests are evaluated one after the other.
"""

from collections.abc import Iterable
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import clock
from app.core.errors import AppError
from app.models import (
    Post,
    PostingSuspension,
    PostingViolation,
    PostType,
    User,
    ViolationAction,
)
from app.services.activity import audit, notify
from app.validators.schemas import SpamNotice

WARNING_AT = 3
SUSPENSION_AT = 5
SUSPENSION_DAYS = 1


def _suspended_error(until: datetime) -> AppError:
    return AppError(
        403,
        "POSTING_SUSPENDED",
        "Posting is suspended until the time shown",
        [{"field": "suspended_until", "message": until.isoformat()}],
    )


def active_suspension(db: Session, user_id: int, now: datetime) -> PostingSuspension | None:
    return db.scalars(
        select(PostingSuspension)
        .where(
            PostingSuspension.user_id == user_id,
            PostingSuspension.lifted_at.is_(None),
            PostingSuspension.starts_at <= now,
            PostingSuspension.ends_at > now,
        )
        .order_by(PostingSuspension.ends_at.desc())
        .limit(1)
    ).first()


def check_before_create(
    db: Session, user: User, post_type: PostType, now: datetime | None = None
) -> datetime:
    """Call inside the creating transaction BEFORE inserting the post (every post type). Locks the
    user row until commit, raises 403 POSTING_SUSPENDED while a suspension is active and returns
    the instant to stamp the new post with. The clock is read AFTER the lock is held, so posts
    created by concurrent requests are ordered the same way as their timestamps."""
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    now = now or clock.utcnow()
    suspension = active_suspension(db, user.id, now)
    if suspension is not None:
        raise _suspended_error(suspension.ends_at)
    return now


def consecutive_general(types_newest_first: Iterable[PostType]) -> int:
    """Length of the run of general posts at the head of a newest-first list of post types."""
    count = 0
    for post_type in types_newest_first:
        if post_type is not PostType.general:
            break
        count += 1
    return count


def series_floor(db: Session, user_id: int, now: datetime) -> datetime:
    """Posts before this instant are not part of the current series: the start of today's
    Bangkok day, or the end of the user's latest suspension when that is later."""
    floor = clock.bangkok_midnight(clock.bangkok_date(now))
    latest = db.scalars(
        select(PostingSuspension)
        .where(PostingSuspension.user_id == user_id)
        .order_by(PostingSuspension.starts_at.desc(), PostingSuspension.id.desc())
        .limit(1)
    ).first()
    if latest is not None:
        ended = min(latest.ends_at, latest.lifted_at) if latest.lifted_at else latest.ends_at
        floor = max(floor, ended)
    return floor


def series_count(db: Session, user_id: int, now: datetime) -> int:
    """Consecutive general posts of the user in the current series, the newest included."""
    types = db.scalars(
        select(Post.type)
        .where(
            Post.author_id == user_id,
            Post.created_at >= series_floor(db, user_id, now),
            Post.created_at <= now,
        )
        .order_by(Post.created_at.desc(), Post.id.desc())
    ).all()
    return consecutive_general(types)


def suspension_window(now: datetime, days: int) -> tuple[date, datetime]:
    """(last suspended Bangkok day, restore instant) of a suspension of `days` calendar days that
    starts today (today = day 1)."""
    start_day = clock.bangkok_date(now)
    return start_day + timedelta(days=days - 1), clock.bangkok_midnight(
        start_day + timedelta(days=days)
    )


def _thai_datetime(moment: datetime) -> str:
    return moment.astimezone(clock.BANGKOK).strftime("%d/%m/%Y %H:%M")


def after_create(
    db: Session, user: User, post: Post, now: datetime | None = None
) -> SpamNotice | None:
    """Call right after a post was flushed (same transaction, user row already locked). Applies
    the warning / suspension and returns what the UI should tell the author."""
    if post.type is not PostType.general or not get_settings().spam_policy_enabled:
        return None
    now = now or clock.utcnow()
    count = series_count(db, user.id, now)
    if count == WARNING_AT:
        db.add(
            PostingViolation(
                user_id=user.id,
                post_id=post.id,
                series_count=count,
                post_type=post.type,
                action=ViolationAction.warning,
                reason=f"{count} consecutive general posts today",
                created_at=now,
            )
        )
        audit(db, user, "spam.warning", "user", user.id, {"post_id": post.id, "count": count})
        notify(
            db,
            [user.id],
            "spam.warning",
            "คำเตือน: โพสต์ทั่วไปติดกันหลายครั้ง",
            f"คุณโพสต์ทั่วไปติดกัน {count} ครั้งในวันนี้ หากโพสต์ครบ {SUSPENSION_AT} ครั้ง "
            f"จะถูกระงับการโพสต์ {SUSPENSION_DAYS} วัน",
            "/profile",
        )
        return SpamNotice(action="warning", count=count, suspended_until=None)
    if count == SUSPENSION_AT:
        days = SUSPENSION_DAYS
        last_day, ends_at = suspension_window(now, days)
        violation = PostingViolation(
            user_id=user.id,
            post_id=post.id,
            series_count=count,
            post_type=post.type,
            action=ViolationAction.suspension,
            reason=f"{count} consecutive general posts today",
            created_at=now,
        )
        db.add(violation)
        db.flush()
        db.add(
            PostingSuspension(
                user_id=user.id,
                violation_id=violation.id,
                starts_at=now,
                last_day=last_day,
                ends_at=ends_at,
                reason=f"{count} consecutive general posts in one day",
            )
        )
        user.posting_suspended_until = ends_at
        audit(
            db,
            user,
            "spam.suspension",
            "user",
            user.id,
            {"ends_at": ends_at.isoformat(), "last_day": last_day.isoformat(), "count": count},
        )
        notify(
            db,
            [user.id],
            "spam.suspension",
            f"ระงับการโพสต์ {days} วัน",
            f"เนื่องจากโพสต์ทั่วไปติดกัน {count} ครั้งในวันเดียว "
            f"สิทธิ์การโพสต์จะกลับมาในวันที่ {_thai_datetime(ends_at)} น. "
            "คุณยังอ่านและใช้งานส่วนอื่นได้ตามปกติ",
            "/profile",
        )
        return SpamNotice(action="suspension", count=count, suspended_until=ends_at)
    return None


def lift_suspension(db: Session, admin: User, user: User) -> bool:
    """Admin: end every active suspension of `user` now. Caller commits."""
    now = clock.utcnow()
    rows = db.scalars(
        select(PostingSuspension).where(
            PostingSuspension.user_id == user.id,
            PostingSuspension.lifted_at.is_(None),
            PostingSuspension.ends_at > now,
        )
    ).all()
    for row in rows:
        row.lifted_at, row.lifted_by = now, admin.id
    user.posting_suspended_until = None
    return bool(rows)
