"""Admin console: stats, user / role management and the faculty / programme catalog."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.middlewares.auth import DbSession, require_permission
from app.models import RoleName, User
from app.repositories.posts import paginate
from app.routes.common import Paging, SearchQuery
from app.routes.route_class import ReleaseConnectionRoute
from app.services import admin as admin_service
from app.services import catalog as catalog_service
from app.services.serializers import faculty_out, program_out, user_out
from app.validators.schemas import (
    AdminStatsOut,
    AdminUserCreateIn,
    AdminUserUpdateIn,
    FacultyCreateIn,
    FacultyOut,
    FacultyUpdateIn,
    Page,
    ProgramCreateIn,
    ProgramOut,
    ProgramUpdateIn,
    UserOut,
)

router = APIRouter(route_class=ReleaseConnectionRoute)
AdminUser = Annotated[User, Depends(require_permission("user:manage"))]


# ---------- admin ----------
@router.get("/admin/stats", response_model=AdminStatsOut, tags=["admin"])
def admin_stats(db: DbSession, _: AdminUser) -> AdminStatsOut:
    return admin_service.stats(db)


@router.get("/admin/users", response_model=Page[UserOut], tags=["admin"])
def admin_users(
    db: DbSession,
    _: AdminUser,
    paging: Paging,
    role: RoleName | None = None,
    suspended: bool | None = None,
    q: SearchQuery = None,
) -> Page[UserOut]:
    """`suspended=true` lists only accounts with an active posting suspension."""
    items, total = paginate(
        db, admin_service.list_users_stmt(role, q, suspended), paging.page, paging.page_size
    )
    return Page(
        items=[user_out(u) for u in items],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.post(
    "/admin/users",
    status_code=status.HTTP_201_CREATED,
    response_model=UserOut,
    tags=["admin"],
)
def admin_create_user(data: AdminUserCreateIn, db: DbSession, admin: AdminUser) -> UserOut:
    """Pre-register a dedicated account; its owner signs in with Google (no password)."""
    return user_out(admin_service.create_user(db, admin, data))


@router.patch("/admin/users/{user_id}", response_model=UserOut, tags=["admin"])
def admin_update_user(
    user_id: int, data: AdminUserUpdateIn, db: DbSession, admin: AdminUser
) -> UserOut:
    return user_out(admin_service.update_user(db, admin, user_id, data))


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["admin"])
def admin_delete_user(user_id: int, db: DbSession, admin: AdminUser) -> Response:
    """Soft delete: the account is disabled, anonymised and can no longer sign in; its posts and
    history stay."""
    admin_service.delete_user(db, admin, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- catalog: faculties and programmes (never deleted, only retired) ----------
@router.get("/admin/faculties", response_model=list[FacultyOut], tags=["admin"])
def admin_faculties(db: DbSession, _: AdminUser) -> list[FacultyOut]:
    """All faculties (inactive too) with all of their programmes."""
    return [faculty_out(f, programs) for f, programs in catalog_service.list_faculties(db)]  # type: ignore[misc]


@router.post(
    "/admin/faculties",
    status_code=status.HTTP_201_CREATED,
    response_model=FacultyOut,
    tags=["admin"],
)
def admin_create_faculty(data: FacultyCreateIn, db: DbSession, admin: AdminUser) -> FacultyOut:
    return faculty_out(catalog_service.create_faculty(db, admin, data))  # type: ignore[return-value]


@router.patch("/admin/faculties/{faculty_id}", response_model=FacultyOut, tags=["admin"])
def admin_update_faculty(
    faculty_id: int, data: FacultyUpdateIn, db: DbSession, admin: AdminUser
) -> FacultyOut:
    faculty = catalog_service.update_faculty(db, admin, faculty_id, data)
    return faculty_out(faculty, list(faculty.programs))  # type: ignore[return-value]


@router.post(
    "/admin/programs",
    status_code=status.HTTP_201_CREATED,
    response_model=ProgramOut,
    tags=["admin"],
)
def admin_create_program(data: ProgramCreateIn, db: DbSession, admin: AdminUser) -> ProgramOut:
    return program_out(catalog_service.create_program(db, admin, data))  # type: ignore[return-value]


@router.patch("/admin/programs/{program_id}", response_model=ProgramOut, tags=["admin"])
def admin_update_program(
    program_id: int, data: ProgramUpdateIn, db: DbSession, admin: AdminUser
) -> ProgramOut:
    return program_out(catalog_service.update_program(db, admin, program_id, data))  # type: ignore[return-value]
