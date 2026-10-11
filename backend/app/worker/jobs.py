"""Background jobs (ADR-001 APScheduler worker, ADR-002 decision 10).

The dashboard never depends on these jobs for correctness: 24h/72h visibility is evaluated at
query time. The jobs keep the stored data tidy and auditable."""

import logging
from datetime import timedelta

from sqlalchemy import delete, select, text, update
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.core.storage import get_storage
from app.models import (
    Attachment,
    AuditLog,
    LostFoundItem,
    LostFoundStatus,
    Post,
    PostStatus,
    PostType,
    RefreshToken,
    RemovalReason,
    RepairRequest,
)
from app.models.enums import TERMINAL_REPAIR_STATUSES
from app.services.expiration import lost_found_archive_cutoff

logger = logging.getLogger("upboard.worker")
ADVISORY_LOCK_ID = 7_240_501  # arbitrary constant shared by all worker processes


def _try_lock(db: Session) -> bool:
    """Prevent duplicate runs if more than one worker process is started."""
    return bool(db.scalar(text("SELECT pg_try_advisory_xact_lock(:id)"), {"id": ADVISORY_LOCK_ID}))


def unpin_expired(db: Session) -> int:
    now = utcnow()
    if not _try_lock(db):
        return 0
    expired = db.scalars(
        select(Post.id).where(Post.pinned_until.is_not(None), Post.pinned_until <= now)
    ).all()
    if expired:
        db.execute(
            update(Post)
            .where(Post.id.in_(expired))
            .values(pinned_at=None, pinned_until=None, pinned_by=None)
        )
        db.add_all(
            AuditLog(actor_id=None, action="post.auto_unpin", entity="post", entity_id=post_id)
            for post_id in expired
        )
    # announcements pinned for a repair that has been closed / rejected
    ended = db.execute(
        update(Post)
        .where(
            Post.pinned_at.is_not(None),
            Post.pinned_until.is_(None),
            Post.related_repair_id.in_(
                select(RepairRequest.post_id).where(
                    RepairRequest.status.in_(TERMINAL_REPAIR_STATUSES)
                )
            ),
        )
        .values(pinned_at=None, pinned_until=None, pinned_by=None)
    ).rowcount
    db.commit()
    return len(expired) + (ended or 0)


def archive_stale_lost_items(db: Session) -> int:
    """A lost & found item that is not `returned` 7 days after posting (lost AND found items) is
    soft-deleted (status removed, reason lost_found_expired). Never hard-deleted; it stays in
    the owner's Post History. Query-time filters already hide it, so a late run changes
    nothing visible."""
    now = utcnow()
    if not _try_lock(db):
        return 0
    stale = db.scalars(
        select(Post.id)
        .join(LostFoundItem, LostFoundItem.post_id == Post.id)
        .where(
            Post.type == PostType.lost_found,
            Post.status == PostStatus.active,
            LostFoundItem.status != LostFoundStatus.returned,
            Post.created_at <= lost_found_archive_cutoff(now),
        )
        .with_for_update(of=Post, skip_locked=True)
    ).all()
    if stale:
        db.execute(
            update(Post)
            .where(Post.id.in_(stale))
            .values(
                status=PostStatus.removed,
                deleted_at=now,
                removal_reason=RemovalReason.lost_found_expired,
                pinned_at=None,
                pinned_until=None,
                pinned_by=None,
            )
        )
        db.add_all(
            AuditLog(
                actor_id=None,
                action="post.auto_archive",
                entity="post",
                entity_id=post_id,
                meta={"reason": RemovalReason.lost_found_expired.value},
            )
            for post_id in stale
        )
    db.commit()
    return len(stale)


def cleanup_orphan_uploads(db: Session, max_age_hours: int = 24) -> int:
    if not _try_lock(db):
        return 0
    cutoff = utcnow() - timedelta(hours=max_age_hours)
    orphans = db.scalars(
        select(Attachment).where(Attachment.post_id.is_(None), Attachment.created_at < cutoff)
    ).all()
    storage = get_storage()
    for attachment in orphans:
        try:
            storage.delete(attachment.storage_key)
        except OSError:
            logger.exception("Could not delete file %s", attachment.storage_key)
            continue
        db.delete(attachment)
    db.commit()
    return len(orphans)


def cleanup_expired_tokens(db: Session) -> int:
    if not _try_lock(db):
        return 0
    now = utcnow()
    removed = db.execute(
        delete(RefreshToken).where(RefreshToken.expires_at < now - timedelta(days=1))
    ).rowcount
    db.commit()
    return removed
