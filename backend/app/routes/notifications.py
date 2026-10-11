"""In-app notifications and the SSE stream (ADR-001 real-time, ADR-002 decision 8)."""

import asyncio
import json
import threading
import time
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import (
    APIRouter,
    Query,
    Request,
    Response,
    status,
)
from sqlalchemy import func, select, update
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings
from app.core.clock import utcnow
from app.core.errors import AppError, not_found
from app.core.events import broker
from app.core.security import TokenError, create_stream_ticket, decode_token
from app.db import SessionLocal
from app.middlewares.auth import CurrentUser, DbSession
from app.models import Notification, User
from app.repositories.posts import paginate
from app.routes.common import Paging
from app.routes.route_class import ReleaseConnectionRoute
from app.validators.schemas import (
    CountOut,
    NotificationOut,
    Page,
    StreamTicketOut,
)

router = APIRouter(route_class=ReleaseConnectionRoute)


# ---------- notifications ----------
@router.get("/notifications", response_model=Page[NotificationOut], tags=["notifications"])
def list_notifications(
    db: DbSession, user: CurrentUser, paging: Paging, unread_only: bool = False
) -> Page[NotificationOut]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
    items, total = paginate(db, stmt, paging.page, paging.page_size)
    return Page(
        items=[NotificationOut.model_validate(n) for n in items],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.get("/notifications/unread-count", response_model=CountOut, tags=["notifications"])
def unread_count(db: DbSession, user: CurrentUser) -> CountOut:
    count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    )
    return CountOut(count=count or 0)


@router.patch(
    "/notifications/{notification_id}/read",
    response_model=NotificationOut,
    tags=["notifications"],
)
def mark_read(notification_id: int, db: DbSession, user: CurrentUser) -> NotificationOut:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise not_found("Notification")
    if notification.read_at is None:
        notification.read_at = utcnow()
        db.commit()
    return NotificationOut.model_validate(notification)


@router.post(
    "/notifications/read-all",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["notifications"],
)
def mark_all_read(db: DbSession, user: CurrentUser) -> Response:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- SSE (ADR-002 decision 8) ----------
# Single-use 60 s ticket, because browsers' EventSource cannot send an Authorization header.
class _UsedTickets:
    def __init__(self) -> None:
        self._used: dict[str, float] = {}
        self._lock = threading.Lock()

    def consume(self, jti: str, ttl: int) -> bool:
        now = time.monotonic()
        with self._lock:
            self._used = {k: v for k, v in self._used.items() if now - v < ttl * 2}
            if jti in self._used:
                return False
            self._used[jti] = now
            return True


used_tickets = _UsedTickets()


@router.post("/stream/ticket", response_model=StreamTicketOut, tags=["notifications"])
def stream_ticket(user: CurrentUser) -> StreamTicketOut:
    ticket, _, expires_in = create_stream_ticket(user.id)
    return StreamTicketOut(ticket=ticket, expires_in=expires_in)


def _authorize_ticket(ticket: str) -> int:
    try:
        payload = decode_token(ticket, "stream")
    except TokenError as exc:
        raise AppError(401, exc.code, "Invalid or expired stream ticket") from exc
    if not used_tickets.consume(payload["jti"], get_settings().stream_ticket_ttl_seconds):
        raise AppError(401, "UNAUTHENTICATED", "Stream ticket already used")
    user_id = int(payload["sub"])
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None or not user.is_active or not user.is_verified:
            raise AppError(401, "UNAUTHENTICATED", "Session is no longer valid")
    return user_id


@router.get("/stream", tags=["notifications"])
async def stream(
    request: Request, ticket: Annotated[str, Query(max_length=1000)]
) -> EventSourceResponse:
    user_id = await asyncio.to_thread(_authorize_ticket, ticket)
    personal = broker.subscribe(user_id)

    async def events() -> AsyncIterator[dict[str, str]]:
        try:
            while not await request.is_disconnected():
                try:
                    message = await asyncio.wait_for(personal.get(), timeout=5)
                except TimeoutError:
                    continue
                payload = json.loads(message)
                yield {
                    "event": payload["event"],
                    "data": json.dumps(payload["data"], ensure_ascii=False),
                }
        finally:
            broker.unsubscribe(user_id, personal)

    return EventSourceResponse(
        events(),
        ping=15,
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
