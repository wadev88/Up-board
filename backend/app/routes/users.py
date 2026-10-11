"""Public profile of another user: name, role, faculty, programme and the contacts they filled
in (no email)."""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.errors import not_found
from app.middlewares.auth import CurrentUser, DbSession
from app.models import User
from app.routes.route_class import ReleaseConnectionRoute
from app.services.serializers import user_public_out
from app.validators.schemas import UserPublicOut

router = APIRouter(route_class=ReleaseConnectionRoute)


@router.get("/users/{user_id}", response_model=UserPublicOut, tags=["users"])
def get_user(user_id: int, db: DbSession, _: CurrentUser) -> UserPublicOut:
    user = db.scalars(select(User).where(User.id == user_id)).unique().first()
    if user is None or not user.is_active or user.deleted_at is not None:
        raise not_found("User")
    return user_public_out(user)
