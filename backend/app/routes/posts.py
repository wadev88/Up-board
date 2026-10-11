from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.core.clock import utcnow
from app.core.errors import AppError
from app.middlewares.auth import CurrentUser, DbSession
from app.models import Faculty, PostCategory, PostType, Program
from app.repositories import posts as posts_repo
from app.routes.common import Paging, SearchQuery
from app.routes.route_class import ReleaseConnectionRoute
from app.services import posts as post_service
from app.services.serializers import faculty_out, post_out
from app.validators.schemas import (
    CategoryOut,
    DashboardOut,
    FacultyOut,
    Page,
    PinIn,
    PostCreateIn,
    PostOut,
    PostUpdateIn,
)

router = APIRouter(tags=["posts"], route_class=ReleaseConnectionRoute)


@router.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/faculties", response_model=list[FacultyOut], tags=["reference"])
def faculties(db: DbSession) -> list[FacultyOut]:
    """Self-service pickers: active faculties (not the admin-only unit) with active programmes."""
    rows = db.scalars(
        select(Program)
        .join(Faculty, Faculty.id == Program.faculty_id)
        .where(Program.is_active, Faculty.admin_only.is_(False))
        .order_by(Program.name_th, Program.id)
    ).all()
    by_faculty: dict[int, list[Program]] = {}
    for program in rows:
        by_faculty.setdefault(program.faculty_id, []).append(program)
    active = db.scalars(
        select(Faculty)
        .where(Faculty.is_active, Faculty.admin_only.is_(False))
        .order_by(Faculty.name_th)
    ).all()
    return [faculty_out(f, by_faculty.get(f.id, [])) for f in active]  # type: ignore[misc]


@router.get("/categories", response_model=list[CategoryOut], tags=["reference"])
def categories(db: DbSession, _: CurrentUser) -> list[PostCategory]:
    return list(db.scalars(select(PostCategory).order_by(PostCategory.id)).all())


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: DbSession, user: CurrentUser) -> DashboardOut:
    return post_service.build_dashboard(db, user)


@router.get("/posts", response_model=Page[PostOut])
def list_posts(
    db: DbSession,
    user: CurrentUser,
    paging: Paging,
    type: PostType | None = None,
    category: Annotated[str | None, Query(max_length=50)] = None,
    faculty_id: int | None = None,
    q: SearchQuery = None,
) -> Page[PostOut]:
    """Community / category / faculty feeds — ACTIVE posts only (ADR-003): general posts and
    announcements for 24h, events until they end, unresolved repairs and lost & found items.
    Without `type`, every post type is listed. Expired posts live on in `GET /me/posts`."""
    now = utcnow()
    stmt = posts_repo.list_posts(
        types=[type] if type else list(PostType),
        now=now,
        category_slug=category,
        faculty_id=faculty_id,
        q=q,
    )
    items, total = posts_repo.paginate(db, stmt, paging.page, paging.page_size)
    return Page(
        items=[post_out(p, user, now) for p in items],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.get("/me/posts", response_model=Page[PostOut])
def post_history(
    db: DbSession,
    user: CurrentUser,
    paging: Paging,
    type: PostType | None = None,
    state: Literal["active", "expired", "resolved", "archived"] | None = None,
    q: SearchQuery = None,
) -> Page[PostOut]:
    """The caller's Post History: their posts of every type, including expired posts and
    archived (auto soft-deleted) lost & found items. Always scoped to the caller (no IDOR)."""
    now = utcnow()
    stmt = posts_repo.post_history(
        author_id=user.id, now=now, types=[type] if type else None, state=state, q=q
    )
    items, total = posts_repo.paginate(db, stmt, paging.page, paging.page_size)
    return Page(
        items=[post_out(p, user, now) for p in items],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.get("/posts/{post_id}", response_model=PostOut)
def get_post(post_id: int, db: DbSession, user: CurrentUser) -> PostOut:
    return post_out(post_service.get_visible_post(db, post_id, viewer=user), user, utcnow())


@router.post(
    "/posts",
    status_code=status.HTTP_201_CREATED,
    response_model=PostOut,
)
def create_post(data: PostCreateIn, db: DbSession, user: CurrentUser) -> PostOut:
    post, notice = post_service.create_post_with_notice(db, user, data)
    out = post_out(post, user, utcnow())
    out.spam_notice = notice
    return out


@router.patch("/posts/{post_id}", response_model=PostOut)
def update_post(post_id: int, data: PostUpdateIn, db: DbSession, user: CurrentUser) -> PostOut:
    return post_out(post_service.update_post(db, user, post_id, data), user, utcnow())


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: int, db: DbSession, user: CurrentUser) -> Response:
    post_service.delete_post(db, user, post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/posts/{post_id}/pin", response_model=PostOut)
def pin_post(post_id: int, db: DbSession, user: CurrentUser, data: PinIn | None = None) -> PostOut:
    """Events (their student_club author) and announcements (their building_staff author); admin
    any. Body `{"hours": 6|12|24|48|72}` is optional (default 48). An event pin never outlives
    the event start; an announcement about a repair stays pinned until the repair ends."""
    hours = data.hours if data is not None else None
    return post_out(post_service.pin_post(db, user, post_id, hours), user, utcnow())


@router.delete("/posts/{post_id}/pin", response_model=PostOut)
def unpin_post(post_id: int, db: DbSession, user: CurrentUser) -> PostOut:
    return post_out(post_service.unpin_post(db, user, post_id), user, utcnow())


@router.get("/events", response_model=list[PostOut])
def events(
    db: DbSession,
    user: CurrentUser,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
) -> list[PostOut]:
    now = utcnow()
    start = from_ or now
    end = to or start + timedelta(days=30)
    if end < start or end - start > timedelta(days=366):
        raise AppError(422, "VALIDATION_ERROR", "Invalid date range (max 366 days)")
    return [post_out(p, user, now) for p in posts_repo.events_between(db, start, end, now)]
