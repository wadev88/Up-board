"""Shared post logic: validation, attachments, edit/delete/pin and the dashboard."""

from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import clock, profanity
from app.core.errors import AppError, forbidden, not_found, profile_incomplete
from app.core.permissions import (
    can,
    can_create,
    can_delete_post,
    can_pin,
    event_priority_allowed,
    has_permission,
    max_event_priority,
)
from app.models import (
    Attachment,
    AttachmentKind,
    Event,
    EventPriority,
    Post,
    PostCategory,
    PostStatus,
    PostType,
    Priority,
    RemovalReason,
    User,
)
from app.repositories import posts as posts_repo
from app.services import ranking, spam
from app.services.activity import audit, notify, publish_after_commit
from app.services.expiration import compute_pin, repair_is_active
from app.services.serializers import post_out
from app.validators.schemas import DashboardOut, PostCreateIn, PostUpdateIn, SpamNotice


# ---------- validation helpers ----------
def ensure_clean(**fields: str | None) -> None:
    details = profanity.check_fields(**fields)
    if details:
        raise AppError(
            422,
            "PROFANITY_DETECTED",
            "Content contains inappropriate language",
            details,
        )


def ensure_can_create(user: User, post_type: PostType) -> None:
    if user.profile_completed_at is None:
        raise profile_incomplete()
    if not can_create(user, post_type):
        raise forbidden(f"Your role cannot create {post_type.value} posts")


def ensure_priority_allowed(user: User, priority: Priority | None) -> None:
    if priority in (None, Priority.normal):
        return
    if not has_permission(user, "post:set_priority"):
        raise forbidden("Your role cannot choose a priority")
    if priority is Priority.urgent and not has_permission(user, "post:priority_urgent"):
        raise forbidden("Your role cannot use the 'urgent' priority")


def ensure_event_priority_allowed(user: User, priority: EventPriority) -> None:
    if not event_priority_allowed(user, priority):
        raise AppError(
            403,
            "FORBIDDEN",
            f"Your role can use event priority up to '{max_event_priority(user).value}'",
            [{"field": "event.priority_level", "message": "above the limit for your role"}],
        )


CATEGORY_SLUG_BY_TYPE = {
    PostType.general: "general",
    PostType.announcement: "announcement",
    PostType.event: "activities",
    PostType.lost_found: "lost-found",
    PostType.repair: "repair",
}


def get_category(db: Session, category_id: int | None, post_type: PostType) -> PostCategory:
    """The category follows the post type; an explicitly supplied id is still validated."""
    if category_id is None:
        return category_by_slug(db, CATEGORY_SLUG_BY_TYPE[post_type])
    category = db.get(PostCategory, category_id)
    if category is None or category.allowed_type not in (None, post_type):
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Invalid category for this post type",
            [
                {
                    "field": "category_id",
                    "message": "Invalid category for this post type",
                }
            ],
        )
    return category


def category_by_slug(db: Session, slug: str) -> PostCategory:
    category = db.scalars(select(PostCategory).where(PostCategory.slug == slug)).first()
    if category is None:
        raise AppError(500, "INTERNAL_ERROR", f"Category '{slug}' is not seeded")
    return category


def attach_files(
    db: Session,
    user: User,
    post: Post,
    attachment_ids: Iterable[int],
    kind: AttachmentKind = AttachmentKind.image,
    replace: bool = False,
) -> None:
    ids = list(dict.fromkeys(attachment_ids))
    if len(ids) > get_settings().max_attachments_per_post:
        raise AppError(422, "VALIDATION_ERROR", "Too many attachments")
    found = db.scalars(select(Attachment).where(Attachment.id.in_(ids))).all() if ids else []
    # New files must be the caller's own unattached uploads; files already on this post may be
    # kept by anyone allowed to edit it (e.g. an admin editing a student's post with photos).
    usable = {
        a.id: a
        for a in found
        if a.post_id == post.id or (a.post_id is None and a.uploaded_by == user.id)
    }
    if len(usable) != len(ids):
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "One or more attachments are invalid",
            [{"field": "attachment_ids", "message": "Unknown or not owned by you"}],
        )
    if replace:
        for existing in list(post.attachments):
            if existing.kind is kind and existing.id not in usable:
                existing.post_id = None  # orphaned → removed by the cleanup job
    for attachment in usable.values():
        if attachment.post_id is None:  # keep the kind of files already on the post
            attachment.post_id = post.id
            attachment.kind = kind
    db.flush()
    db.refresh(post, attribute_names=["attachments"])


def get_visible_post(
    db: Session, post_id: int, post_type: PostType | None = None, viewer: User | None = None
) -> Post:
    """Active post, or — for its owner only — an archived one from their Post History."""
    post = posts_repo.get_active(db, post_id, post_type)
    if post is None and viewer is not None:
        post = posts_repo.get_archived_own(db, post_id, viewer.id, post_type)
    if post is None:
        raise not_found("Post")
    return post


# ---------- general posts, announcements & events ----------
def _related_repair_or_422(db: Session, repair_id: int) -> Post:
    repair = db.get(Post, repair_id)
    if (
        repair is None
        or repair.type is not PostType.repair
        or repair.status is not PostStatus.active
        or not repair_is_active(repair)
    ):
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "related_repair_id must be an unfinished repair request",
            [{"field": "related_repair_id", "message": "Unknown or already closed repair"}],
        )
    return repair


def create_post(db: Session, user: User, data: PostCreateIn) -> Post:
    return create_post_with_notice(db, user, data)[0]


def create_post_with_notice(
    db: Session, user: User, data: PostCreateIn
) -> tuple[Post, SpamNotice | None]:
    post_type = PostType(data.type)
    ensure_can_create(user, post_type)
    ensure_priority_allowed(user, data.priority)
    priority_level = None
    if data.event is not None:
        priority_level = data.event.priority_level or max_event_priority(user)
        ensure_event_priority_allowed(user, priority_level)
    ensure_clean(
        title=data.title,
        content=data.content,
        **{"event.venue": data.event.venue if data.event else None},
    )
    category = get_category(db, data.category_id, post_type)
    now = spam.check_before_create(db, user, post_type)  # locks the user row until commit
    if data.related_repair_id is not None:
        _related_repair_or_422(db, data.related_repair_id)
    post = Post(
        type=post_type,
        title=data.title,
        content=data.content,
        category_id=category.id,
        author_id=user.id,
        faculty_id=user.faculty_id,
        priority=data.priority,
        status=PostStatus.active,
        related_repair_id=data.related_repair_id,
        created_at=now,
    )
    db.add(post)
    db.flush()
    if data.event is not None:
        post.event = Event(
            post_id=post.id,
            starts_at=data.event.starts_at,
            ends_at=data.event.ends_at,
            venue=data.event.venue,
            priority_level=priority_level,
        )
    attach_files(db, user, post, data.attachment_ids)
    notice = spam.after_create(db, user, post, now)
    publish_after_commit(db, "post.created", {"id": post.id, "type": post.type.value})
    db.commit()
    return post, notice


def update_post(db: Session, user: User, post_id: int, data: PostUpdateIn) -> Post:
    post = get_visible_post(db, post_id)
    if not can(user, "post:update", post):
        raise forbidden()
    ensure_priority_allowed(user, data.priority)
    ensure_clean(
        title=data.title,
        content=data.content,
        **{"event.venue": data.event.venue if data.event else None},
    )
    if data.title is not None:
        post.title = data.title
    if data.content is not None:
        post.content = data.content
    if data.priority is not None:
        post.priority = data.priority
    if data.category_id is not None:
        post.category_id = get_category(db, data.category_id, post.type).id
    if data.event is not None:
        if post.type is not PostType.event or post.event is None:
            raise AppError(422, "VALIDATION_ERROR", "Only events have event details")
        level = data.event.priority_level or post.event.priority_level
        if level is not post.event.priority_level:
            ensure_event_priority_allowed(user, level)
        post.event.starts_at = data.event.starts_at
        post.event.ends_at = data.event.ends_at
        post.event.venue = data.event.venue
        post.event.priority_level = level
        if post.pinned_by is not None:  # pin window follows the start time; re-pin if wanted
            _clear_pin(post)
    if data.attachment_ids is not None:
        attach_files(db, user, post, data.attachment_ids, replace=True)
    post.updated_at = clock.utcnow()
    if post.author_id != user.id:
        audit(db, user, "post.update", "post", post.id, {"author_id": post.author_id})
    db.commit()
    return post


def delete_post(db: Session, user: User, post_id: int) -> None:
    post = get_visible_post(db, post_id)
    if not can_delete_post(user, post):
        raise forbidden("Repair requests cannot be deleted by their author")
    is_owner = post.author_id == user.id
    soft_delete(db, user, post, RemovalReason.author if is_owner else RemovalReason.admin)
    db.commit()


def soft_delete(db: Session, actor: User | None, post: Post, reason: RemovalReason) -> None:
    """ADR-002: content is never hard-deleted; it is hidden and audited."""
    post.status = PostStatus.removed
    post.deleted_at = clock.utcnow()
    post.removal_reason = reason
    _clear_pin(post)
    if post.type is PostType.repair:
        clear_related_pins(db, post.id)
    audit(
        db,
        actor,
        "post.delete",
        "post",
        post.id,
        {"reason": reason.value, "author_id": post.author_id},
    )


def _clear_pin(post: Post) -> None:
    post.pinned_at = None
    post.pinned_until = None
    post.pinned_by = None


def clear_related_pins(db: Session, repair_post_id: int) -> None:
    """A repair ended (closed / rejected / removed): announcements pinned for it lose their pin."""
    db.execute(
        update(Post)
        .where(Post.related_repair_id == repair_post_id, Post.pinned_at.is_not(None))
        .values(pinned_at=None, pinned_until=None, pinned_by=None)
    )


# ---------- pins: events (clubs) and announcements (building staff) ----------
def pin_post(db: Session, user: User, post_id: int, hours: int | None = None) -> Post:
    post = get_visible_post(db, post_id)
    if not can_pin(user, post):
        raise forbidden("You cannot pin this post")
    now = clock.utcnow()
    related_active: bool | None = None
    if post.related_repair_id is not None:
        related = db.get(Post, post.related_repair_id)
        related_active = bool(
            related is not None
            and related.status is PostStatus.active
            and repair_is_active(related)
        )
    window = compute_pin(post, now, hours, related_active)
    post.pinned_at, post.pinned_until, post.pinned_by = (
        window.pinned_at,
        window.pinned_until,
        user.id,
    )
    db.flush()
    audit(
        db,
        user,
        "post.pin",
        "post",
        post.id,
        {
            "pinned_at": window.pinned_at.isoformat(),
            "pinned_until": window.pinned_until.isoformat() if window.pinned_until else None,
            "hours": hours,
        },
    )
    publish_after_commit(db, "post.updated", {"id": post.id, "type": post.type.value})
    db.commit()
    return post


def unpin_post(db: Session, user: User, post_id: int) -> Post:
    post = get_visible_post(db, post_id)
    # whoever may pin the post (its author in the right role, or an admin), or an admin moderating
    if not (can_pin(user, post) or has_permission(user, "report:manage")):
        raise forbidden("You cannot unpin this post")
    if post.pinned_by is not None:
        _clear_pin(post)
        audit(db, user, "post.unpin", "post", post.id)
        if post.author_id != user.id:
            notify(
                db,
                [post.author_id],
                "post.unpinned",
                "โพสต์ของคุณถูกยกเลิกการปักหมุด",
                post.title,
                f"/posts/{post.id}",
            )
        publish_after_commit(db, "post.updated", {"id": post.id, "type": post.type.value})
    db.commit()
    return post


# ---------- dashboard ----------
def build_dashboard(db: Session, viewer: User, now: datetime | None = None) -> DashboardOut:
    now = now or clock.utcnow()
    limit = get_settings().dashboard_section_limit
    pinned = ranking.pick_pinned(posts_repo.pinned_posts(db, now), now)
    pinned_ids = {p.id for p in pinned}
    upcoming = posts_repo.upcoming_events(db, now, limit, exclude_ids=pinned_ids)
    recent = posts_repo.recent_posts(db, now, limit, exclude_ids=pinned_ids)
    repairs = posts_repo.active_repairs(db, now, limit, exclude_ids=pinned_ids)
    lost_found = posts_repo.open_lost_found(db, now, limit, exclude_ids=pinned_ids)
    return DashboardOut(
        pinned=[post_out(p, viewer, now) for p in pinned],
        upcoming=[post_out(p, viewer, now) for p in upcoming],
        recent=[post_out(p, viewer, now) for p in recent],
        repairs=[post_out(p, viewer, now) for p in repairs],
        lost_found=[post_out(p, viewer, now) for p in lost_found],
        generated_at=now,
    )
