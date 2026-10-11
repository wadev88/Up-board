"""Authentication + RBAC dependencies. Every protected route depends on `current_user`;
role/permission gates use `require_permission` (ADR-001: the backend always checks)."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import AppError, forbidden, profile_incomplete, unauthenticated
from app.core.permissions import has_permission
from app.core.security import TokenError, decode_token
from app.db import get_db
from app.models import User

DbSession = Annotated[Session, Depends(get_db)]


def _bearer_token(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise unauthenticated()
    return token


def current_user(request: Request, db: DbSession) -> User:
    try:
        payload = decode_token(_bearer_token(request), "access")
    except TokenError as exc:
        raise unauthenticated("Invalid or expired token", exc.code) from exc
    user = db.get(User, int(payload["sub"]))
    # End the read-only transaction so the pooled connection is returned BEFORE FastAPI hops to
    # another threadpool thread for the endpoint. Holding it across the hop deadlocks under load
    # (every thread waits for a connection while every connection waits for a thread) — found by
    # the NFR-11 load test. expire_on_commit=False keeps `user` usable.
    db.commit()
    # token_version changes on role change / deactivation / logout-all → old JWTs die immediately
    if user is None or user.token_version != payload.get("tv"):
        raise unauthenticated("Session is no longer valid")
    if not user.is_active:
        raise AppError(403, "ACCOUNT_DISABLED", "This account has been disabled")
    if not user.is_verified:
        raise AppError(403, "EMAIL_NOT_VERIFIED", "Please verify your email first")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_permission(permission: str) -> Callable[[User], User]:
    def dependency(user: CurrentUser) -> User:
        if user.profile_completed_at is None:
            raise profile_incomplete()
        if not has_permission(user, permission):
            raise forbidden()
        return user

    return dependency
