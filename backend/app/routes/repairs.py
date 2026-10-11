from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.core.clock import utcnow
from app.middlewares.auth import CurrentUser, DbSession, require_permission
from app.models import LostFoundStatus, PostType, RepairStatus, RoleName, Technician, User
from app.repositories import posts as posts_repo
from app.routes.common import Paging, SearchQuery
from app.routes.route_class import ReleaseConnectionRoute
from app.services import lost_found as lost_found_service
from app.services import repairs as repair_service
from app.services.posts import get_visible_post
from app.services.serializers import post_out, technician_out
from app.validators.schemas import (
    AssignIn,
    LostFoundCreateIn,
    LostFoundUpdateIn,
    Page,
    PostOut,
    RepairCreateIn,
    RepairPriorityIn,
    RepairStatusIn,
    TechnicianOut,
)

router = APIRouter(route_class=ReleaseConnectionRoute)


# ---------- repairs (public to logged-in users, ADR-002) ----------
@router.get("/repairs", response_model=Page[PostOut], tags=["repairs"])
def list_repairs(
    db: DbSession,
    user: CurrentUser,
    paging: Paging,
    status: RepairStatus | None = None,
    mine: bool = False,
    assigned_to_me: bool = False,
    q: SearchQuery = None,
) -> Page[PostOut]:
    stmt = posts_repo.list_repairs(
        now=utcnow(),
        status=status,
        reporter_id=user.id if mine else None,
        technician_user_id=user.id if assigned_to_me else None,
        q=q,
    )
    items, total = posts_repo.paginate(db, stmt, paging.page, paging.page_size)
    now = utcnow()
    return Page(
        items=[post_out(p, user, now) for p in items],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.post(
    "/repairs",
    status_code=status.HTTP_201_CREATED,
    response_model=PostOut,
    tags=["repairs"],
    dependencies=[Depends(require_permission("repair:create"))],
)
def create_repair(data: RepairCreateIn, db: DbSession, user: CurrentUser) -> PostOut:
    return post_out(repair_service.create_repair(db, user, data), user, utcnow())


@router.get("/repairs/{post_id}", response_model=PostOut, tags=["repairs"])
def get_repair(post_id: int, db: DbSession, user: CurrentUser) -> PostOut:
    return post_out(get_visible_post(db, post_id, PostType.repair, viewer=user), user, utcnow())


@router.patch("/repairs/{post_id}", response_model=PostOut, tags=["repairs"])
def update_repair_status(
    post_id: int, data: RepairStatusIn, db: DbSession, user: CurrentUser
) -> PostOut:
    return post_out(repair_service.update_status(db, user, post_id, data), user, utcnow())


@router.patch("/repairs/{post_id}/assign", response_model=PostOut, tags=["repairs"])
def assign_technician(post_id: int, data: AssignIn, db: DbSession, user: CurrentUser) -> PostOut:
    return post_out(repair_service.assign(db, user, post_id, data.technician_id), user, utcnow())


@router.patch("/repairs/{post_id}/priority", response_model=PostOut, tags=["repairs"])
def set_repair_priority(
    post_id: int, data: RepairPriorityIn, db: DbSession, user: CurrentUser
) -> PostOut:
    return post_out(repair_service.set_priority(db, user, post_id, data.priority), user, utcnow())


@router.get("/technicians", response_model=list[TechnicianOut], tags=["repairs"])
def technicians(
    db: DbSession, _: User = Depends(require_permission("technician:list"))
) -> list[TechnicianOut]:
    rows = (
        db.scalars(select(Technician).where(Technician.is_available).order_by(Technician.id))
        .unique()
        .all()
    )
    return [
        technician_out(t)
        for t in rows
        if t.user.is_active and t.user.role_name is RoleName.technician
    ]


# ---------- lost & found ----------
@router.get("/lost-found", response_model=Page[PostOut], tags=["lost-found"])
def list_lost_found(
    db: DbSession,
    user: CurrentUser,
    paging: Paging,
    status: LostFoundStatus | None = None,
    mine: bool = False,
    q: SearchQuery = None,
) -> Page[PostOut]:
    stmt = posts_repo.list_lost_found(
        now=utcnow(), status=status, author_id=user.id if mine else None, q=q
    )
    items, total = posts_repo.paginate(db, stmt, paging.page, paging.page_size)
    now = utcnow()
    return Page(
        items=[post_out(p, user, now) for p in items],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.post(
    "/lost-found",
    status_code=status.HTTP_201_CREATED,
    response_model=PostOut,
    tags=["lost-found"],
    dependencies=[Depends(require_permission("lost_found:create"))],
)
def create_lost_found(data: LostFoundCreateIn, db: DbSession, user: CurrentUser) -> PostOut:
    return post_out(lost_found_service.create_item(db, user, data), user, utcnow())


@router.get("/lost-found/{post_id}", response_model=PostOut, tags=["lost-found"])
def get_lost_found(post_id: int, db: DbSession, user: CurrentUser) -> PostOut:
    post = get_visible_post(db, post_id, PostType.lost_found, viewer=user)
    return post_out(post, user, utcnow())


@router.patch("/lost-found/{post_id}", response_model=PostOut, tags=["lost-found"])
def update_lost_found(
    post_id: int, data: LostFoundUpdateIn, db: DbSession, user: CurrentUser
) -> PostOut:
    return post_out(lost_found_service.update_item(db, user, post_id, data), user, utcnow())
