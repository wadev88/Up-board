"""Moderation reports — create + read own (all users), manage (admin only)."""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.rate_limit import enforce, rate_limit
from app.middlewares.auth import CurrentUser, DbSession, require_permission
from app.models import ReportStatus, User
from app.repositories.posts import paginate
from app.routes.common import Paging
from app.routes.route_class import ReleaseConnectionRoute
from app.services import moderation
from app.services.serializers import report_out
from app.validators.schemas import (
    Page,
    ReportCreateIn,
    ReportOut,
    ReportUpdateIn,
)

router = APIRouter(route_class=ReleaseConnectionRoute)
Moderator = Annotated[User, Depends(require_permission("report:manage"))]


# ---------- reports ----------
@router.post(
    "/reports",
    status_code=status.HTTP_201_CREATED,
    response_model=ReportOut,
    tags=["reports"],
    dependencies=[
        Depends(require_permission("report:create")),
        Depends(rate_limit("report", 300, 60)),
    ],
)
def create_report(data: ReportCreateIn, db: DbSession, user: CurrentUser) -> ReportOut:
    enforce(f"report:{user.id}", 10, 60)
    return report_out(moderation.create_report(db, user, data))


@router.get("/reports", response_model=Page[ReportOut], tags=["reports"])
def list_reports(
    db: DbSession, _: Moderator, paging: Paging, status: ReportStatus | None = None
) -> Page[ReportOut]:
    items, total = paginate(db, moderation.list_reports_stmt(status), paging.page, paging.page_size)
    return Page(
        items=[report_out(r) for r in items],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.get("/reports/mine", response_model=Page[ReportOut], tags=["reports"])
def my_reports(db: DbSession, user: CurrentUser, paging: Paging) -> Page[ReportOut]:
    items, total = paginate(db, moderation.my_reports_stmt(user), paging.page, paging.page_size)
    return Page(
        items=[report_out(r) for r in items],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.get("/reports/{report_id}", response_model=ReportOut, tags=["reports"])
def get_report(report_id: int, db: DbSession, user: CurrentUser) -> ReportOut:
    """The reporter or an admin; anybody else gets 404."""
    return report_out(moderation.get_report(db, user, report_id))


@router.patch("/reports/{report_id}", response_model=ReportOut, tags=["reports"])
def update_report(
    report_id: int, data: ReportUpdateIn, db: DbSession, admin: Moderator
) -> ReportOut:
    return report_out(moderation.transition(db, admin, report_id, data.status, data.note))
