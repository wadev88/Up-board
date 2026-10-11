"""Audit trail, notifications and real-time events.

Notifications/SSE events are queued on the session and published only AFTER the transaction
commits, so clients are never told about data that was rolled back."""

from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.events import broker
from app.models import AuditLog, Notification, User

_PENDING_KEY = "pending_events"


def audit(
    db: Session,
    actor: User | None,
    action: str,
    entity: str,
    entity_id: int | None,
    meta: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity=entity,
            entity_id=entity_id,
            meta=meta,
        )
    )


def publish_after_commit(
    db: Session,
    event_name: str,
    data: dict[str, Any],
    user_ids: list[int] | None = None,
) -> None:
    db.info.setdefault(_PENDING_KEY, []).append((event_name, data, user_ids))


def notify(
    db: Session,
    user_ids: set[int] | list[int],
    type_: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    exclude: int | None = None,
) -> None:
    for user_id in {uid for uid in user_ids if uid != exclude}:
        notification = Notification(user_id=user_id, type=type_, title=title, body=body, link=link)
        db.add(notification)
        db.flush()
        publish_after_commit(
            db,
            "notification",
            {
                "id": notification.id,
                "type": type_,
                "title": title,
                "body": body,
                "link": link,
                "read_at": None,
                "created_at": notification.created_at.isoformat(),
            },
            [user_id],
        )


@event.listens_for(Session, "after_commit")
def _flush_events(session: Session) -> None:
    for event_name, data, user_ids in session.info.pop(_PENDING_KEY, []):
        broker.publish(event_name, data, user_ids)


@event.listens_for(Session, "after_rollback")
def _drop_events(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)
