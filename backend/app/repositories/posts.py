"""Post queries. Every visibility / expiry rule (ADR-003) is applied HERE, in SQL, against the
request's `now` — the frontend never filters, and correctness never depends on the worker."""

from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import ColumnElement, Select, and_, exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.config import get_settings
from app.models import (
    ACTIVE_REPAIR_STATUSES,
    TERMINAL_REPAIR_STATUSES,
    Event,
    LostFoundItem,
    LostFoundStatus,
    Post,
    PostCategory,
    PostStatus,
    PostType,
    RemovalReason,
    RepairRequest,
    RepairStatus,
    Technician,
)
from app.services.expiration import lost_found_archive_cutoff

HistoryState = Literal["active", "expired", "resolved", "archived"]


def get_active(db: Session, post_id: int, post_type: PostType | None = None) -> Post | None:
    stmt = select(Post).where(Post.id == post_id, Post.status == PostStatus.active)
    if post_type is not None:
        stmt = stmt.where(Post.type == post_type)
    return db.scalars(stmt).unique().first()


def get_archived_own(
    db: Session, post_id: int, author_id: int, post_type: PostType | None = None
) -> Post | None:
    """Archived (auto soft-deleted) posts stay readable by their owner in Post History."""
    stmt = select(Post).where(
        Post.id == post_id,
        Post.author_id == author_id,
        Post.status == PostStatus.removed,
        Post.removal_reason == RemovalReason.lost_found_expired,
    )
    if post_type is not None:
        stmt = stmt.where(Post.type == post_type)
    return db.scalars(stmt).unique().first()


def paginate(db: Session, stmt: Select, page: int, page_size: int) -> tuple[list[Post], int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.limit(page_size).offset((page - 1) * page_size)).unique().all()
    return list(items), total


def like_pattern(q: str) -> str:
    """Escape LIKE wildcards so user input is matched literally."""
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _search(stmt: Select, q: str | None) -> Select:
    if not q:
        return stmt
    # ILIKE works for Thai (no word boundaries between words).
    pattern = like_pattern(q)
    return stmt.where(or_(Post.title.ilike(pattern), Post.content.ilike(pattern)))


# ---------- lifecycle clauses (mirror services.expiration.post_lifecycle) ----------
def _feed_start(now: datetime) -> datetime:
    return now - timedelta(hours=get_settings().dashboard_window_hours)


def _announcement_start(now: datetime) -> datetime:
    return now - timedelta(days=get_settings().announcement_window_days)


def event_end_expr() -> ColumnElement:
    return func.coalesce(Event.ends_at, Event.starts_at)


# The EXISTS subqueries correlate to Post only: feeds that already join Event
# (event list, calendar) would otherwise auto-correlate Event away too.
def _event_where(*conditions: ColumnElement) -> ColumnElement:
    return exists().where(Event.post_id == Post.id, *conditions).correlate(Post)


def _repair_where(*conditions: ColumnElement) -> ColumnElement:
    return exists().where(RepairRequest.post_id == Post.id, *conditions).correlate(Post)


def _lost_found_where(*conditions: ColumnElement) -> ColumnElement:
    return exists().where(LostFoundItem.post_id == Post.id, *conditions).correlate(Post)


def _lost_archived_by_age(now: datetime) -> ColumnElement:
    """Lost AND found items are visible for 7 days from created_at; `returned` leaves at once."""
    return and_(
        Post.type == PostType.lost_found,
        Post.created_at <= lost_found_archive_cutoff(now),
        _lost_found_where(LostFoundItem.status != LostFoundStatus.returned),
    )


def _related_repair_active() -> ColumnElement:
    """Announcement whose related repair is still being worked on (stays in the feeds / pinned)."""
    related = aliased(Post)
    return (
        exists()
        .where(
            related.id == Post.related_repair_id,
            related.status == PostStatus.active,
            RepairRequest.post_id == related.id,
            RepairRequest.status.in_(ACTIVE_REPAIR_STATUSES),
        )
        .correlate(Post)
    )


def active_clause(now: datetime) -> ColumnElement:
    """Posts that belong in the active feeds right now (status must be checked separately)."""
    return or_(
        and_(Post.type == PostType.general, Post.created_at > _feed_start(now)),
        and_(
            Post.type == PostType.announcement,
            or_(Post.created_at > _announcement_start(now), _related_repair_active()),
        ),
        and_(Post.type == PostType.event, _event_where(event_end_expr() > now)),
        and_(
            Post.type == PostType.repair,
            _repair_where(RepairRequest.status.in_(ACTIVE_REPAIR_STATUSES)),
        ),
        and_(
            Post.type == PostType.lost_found,
            _lost_found_where(LostFoundItem.status != LostFoundStatus.returned),
            ~_lost_archived_by_age(now),
        ),
    )


def _state_clause(state: HistoryState, now: datetime) -> ColumnElement:
    is_active = Post.status == PostStatus.active
    if state == "active":
        return and_(is_active, active_clause(now))
    if state == "expired":
        return and_(
            is_active,
            or_(
                and_(Post.type == PostType.general, Post.created_at <= _feed_start(now)),
                and_(
                    Post.type == PostType.announcement,
                    Post.created_at <= _announcement_start(now),
                    ~_related_repair_active(),
                ),
                and_(Post.type == PostType.event, _event_where(event_end_expr() <= now)),
            ),
        )
    if state == "resolved":
        return and_(
            is_active,
            or_(
                _repair_where(RepairRequest.status.in_(TERMINAL_REPAIR_STATUSES)),
                _lost_found_where(LostFoundItem.status == LostFoundStatus.returned),
            ),
        )
    return or_(
        Post.removal_reason == RemovalReason.lost_found_expired,
        and_(is_active, _lost_archived_by_age(now)),
    )


# ---------- feeds ----------
def list_posts(
    *,
    types: list[PostType],
    now: datetime,
    category_slug: str | None = None,
    faculty_id: int | None = None,
    q: str | None = None,
) -> Select:
    """Community / faculty feeds: only ACTIVE posts (24h rule, ended events hidden, …).
    Events-only feeds are ordered like the upcoming list; mixed feeds newest first."""
    stmt = select(Post).where(
        Post.status == PostStatus.active, Post.type.in_(types), active_clause(now)
    )
    if category_slug:
        stmt = stmt.join(PostCategory, Post.category_id == PostCategory.id).where(
            PostCategory.slug == category_slug
        )
    if faculty_id is not None:
        stmt = stmt.where(Post.faculty_id == faculty_id)
    stmt = _search(stmt, q)
    if types == [PostType.event]:
        return _order_events(stmt.join(Event, Event.post_id == Post.id))
    return stmt.order_by(Post.created_at.desc(), Post.id.desc())


def _order_events(stmt: Select) -> Select:
    # priority University > Faculty > Department FIRST, then starts_at ascending, then stable id
    # (event_priority is a PostgreSQL enum declared department < faculty < university)
    return stmt.order_by(Event.priority_level.desc(), Event.starts_at.asc(), Post.id.asc())


def post_history(
    *,
    author_id: int,
    now: datetime,
    types: list[PostType] | None = None,
    state: HistoryState | None = None,
    q: str | None = None,
) -> Select:
    """The owner's Post History: active, expired and resolved posts plus archived
    (auto soft-deleted) lost & found items. Posts the owner or a moderator deleted are not shown."""
    stmt = select(Post).where(
        Post.author_id == author_id,
        or_(
            Post.status == PostStatus.active,
            Post.removal_reason == RemovalReason.lost_found_expired,
        ),
    )
    if types:
        stmt = stmt.where(Post.type.in_(types))
    if state is not None:
        stmt = stmt.where(_state_clause(state, now))
    return _search(stmt, q).order_by(Post.created_at.desc(), Post.id.desc())


def list_repairs(
    *,
    now: datetime,
    status: RepairStatus | None,
    reporter_id: int | None,
    technician_user_id: int | None,
    q: str | None,
) -> Select:
    """Active repair list hides closed / rejected unless asked for them (status filter) or when
    listing the caller's own requests / jobs (their history)."""
    stmt = (
        select(Post)
        .join(RepairRequest, RepairRequest.post_id == Post.id)
        .where(Post.status == PostStatus.active, Post.type == PostType.repair)
    )
    if status is not None:
        stmt = stmt.where(RepairRequest.status == status)
    elif reporter_id is None and technician_user_id is None:
        stmt = stmt.where(RepairRequest.status.in_(ACTIVE_REPAIR_STATUSES))
    if reporter_id is not None:
        stmt = stmt.where(Post.author_id == reporter_id)
    if technician_user_id is not None:
        stmt = stmt.join(Technician, Technician.id == RepairRequest.assigned_technician_id).where(
            Technician.user_id == technician_user_id
        )
    return _search(stmt, q).order_by(Post.created_at.desc(), Post.id.desc())


def list_lost_found(
    *, now: datetime, status: LostFoundStatus | None, author_id: int | None, q: str | None
) -> Select:
    """Unresolved list by default: `returned` items and items older than 7 days are hidden.
    `status=returned` shows resolved items; `mine` lists the caller's own active items."""
    stmt = (
        select(Post)
        .join(LostFoundItem, LostFoundItem.post_id == Post.id)
        .where(Post.status == PostStatus.active, Post.type == PostType.lost_found)
    )
    if status is not None:
        stmt = stmt.where(LostFoundItem.status == status)
    elif author_id is None:
        stmt = stmt.where(LostFoundItem.status != LostFoundStatus.returned)
    if author_id is not None:
        stmt = stmt.where(Post.author_id == author_id)
    else:
        stmt = stmt.where(~_lost_archived_by_age(now))
    return _search(stmt, q).order_by(Post.created_at.desc(), Post.id.desc())


# ---------- dashboard ----------
def pinned_posts(db: Session, now: datetime) -> list[Post]:
    """All pins active right now on posts that are still active. A pin without an end belongs to
    an announcement about a repair and lasts while that repair is active."""
    stmt = select(Post).where(
        Post.status == PostStatus.active,
        Post.pinned_at <= now,
        or_(
            Post.pinned_until > now,
            and_(Post.pinned_until.is_(None), _related_repair_active()),
        ),
        active_clause(now),
    )
    return list(db.scalars(stmt).unique().all())


def upcoming_events(
    db: Session, now: datetime, limit: int, exclude_ids: set[int] | None = None
) -> list[Post]:
    stmt = (
        select(Post)
        .join(Event, Event.post_id == Post.id)
        .where(
            Post.status == PostStatus.active,
            Post.type == PostType.event,
            event_end_expr() > now,
        )
    )
    if exclude_ids:
        stmt = stmt.where(Post.id.not_in(exclude_ids))
    return list(db.scalars(_order_events(stmt).limit(limit)).unique().all())


def recent_posts(
    db: Session, now: datetime, limit: int, exclude_ids: set[int] | None = None
) -> list[Post]:
    """General posts (24 h) and announcements (7 days / related repair active), newest first."""
    stmt = select(Post).where(
        Post.status == PostStatus.active,
        Post.type.in_([PostType.general, PostType.announcement]),
        Post.created_at <= now,
        active_clause(now),
    )
    if exclude_ids:
        stmt = stmt.where(Post.id.not_in(exclude_ids))
    stmt = stmt.order_by(Post.created_at.desc(), Post.id.desc()).limit(limit)
    return list(db.scalars(stmt).unique().all())


def active_repairs(
    db: Session, now: datetime, limit: int, exclude_ids: set[int] | None = None
) -> list[Post]:
    """Unfinished repairs: priority (urgent first), then newest."""
    stmt = (
        select(Post)
        .join(RepairRequest, RepairRequest.post_id == Post.id)
        .where(
            Post.status == PostStatus.active,
            Post.type == PostType.repair,
            RepairRequest.status.in_(ACTIVE_REPAIR_STATUSES),
        )
    )
    if exclude_ids:
        stmt = stmt.where(Post.id.not_in(exclude_ids))
    stmt = stmt.order_by(Post.priority.desc(), Post.created_at.desc(), Post.id.desc())
    return list(db.scalars(stmt.limit(limit)).unique().all())


def open_lost_found(
    db: Session, now: datetime, limit: int, exclude_ids: set[int] | None = None
) -> list[Post]:
    """Items still being searched for / waiting for their owner: not returned, within 7 days."""
    stmt = (
        select(Post)
        .join(LostFoundItem, LostFoundItem.post_id == Post.id)
        .where(
            Post.status == PostStatus.active,
            Post.type == PostType.lost_found,
            LostFoundItem.status != LostFoundStatus.returned,
            ~_lost_archived_by_age(now),
        )
    )
    if exclude_ids:
        stmt = stmt.where(Post.id.not_in(exclude_ids))
    stmt = stmt.order_by(Post.created_at.desc(), Post.id.desc())
    return list(db.scalars(stmt.limit(limit)).unique().all())


def events_between(db: Session, start: datetime, end: datetime, now: datetime) -> list[Post]:
    """Calendar: events starting in [start, end] that have not ended."""
    stmt = (
        select(Post)
        .join(Event, Event.post_id == Post.id)
        .where(
            Post.status == PostStatus.active,
            Post.type == PostType.event,
            Event.starts_at.between(start, end),
            event_end_expr() > now,
        )
    )
    return list(db.scalars(_order_events(stmt).limit(200)).unique().all())
