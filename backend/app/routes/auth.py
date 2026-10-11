from typing import Annotated

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    Request,
    Response,
    status,
)

from app.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import client_ip, enforce, rate_limit
from app.core.supabase_auth import verify_access_token
from app.middlewares.auth import CurrentUser, DbSession
from app.routes.route_class import ReleaseConnectionRoute
from app.services import auth as auth_service
from app.services.auth import IssuedTokens
from app.services.posts import ensure_clean
from app.services.serializers import user_out
from app.validators.schemas import (
    AuthConfigOut,
    LoginIn,
    Message,
    OnboardingIn,
    ProfileUpdateIn,
    RegisterIn,
    SupabaseExchangeIn,
    TokenOut,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"], route_class=ReleaseConnectionRoute)
REFRESH_COOKIE = "refresh_token"
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def _cookie_path() -> str:
    return f"{get_settings().api_prefix}/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path=_cookie_path(),
    )


def _token_response(response: Response, tokens: IssuedTokens) -> TokenOut:
    _set_refresh_cookie(response, tokens.refresh_token)
    response.headers["Cache-Control"] = "no-store"
    return TokenOut(
        access_token=tokens.access_token,
        expires_in=tokens.expires_in,
        user=user_out(tokens.user),
    )


def check_origin(request: Request) -> None:
    """CSRF defence for cookie-authenticated endpoints (refresh cookie may be SameSite=None)."""
    origin = request.headers.get("origin")
    if origin is not None and origin not in get_settings().cors_origins:
        raise AppError(403, "FORBIDDEN", "Origin not allowed")


@router.get("/config", response_model=AuthConfigOut)
def auth_config() -> AuthConfigOut:
    """Public: which sign-in methods the login page should offer."""
    settings = get_settings()
    return AuthConfigOut(
        google_enabled=settings.google_login_enabled,
        password_signup_enabled=settings.password_signup_enabled,
        allowed_email_domain=settings.allowed_email_domain,
    )


@router.post(
    "/supabase",
    response_model=TokenOut,
    dependencies=[Depends(check_origin), Depends(rate_limit("google", 300, 60))],
)
def supabase_exchange(
    data: SupabaseExchangeIn, request: Request, response: Response, db: DbSession
) -> TokenOut:
    """ADR-003: exchange a Supabase (Google) access token for an UP Board session. Rejected
    unless the Google account is verified and exactly @up.ac.th. The optional `password` is the
    registration password of a still-unverified self-registered account (never logged)."""
    identity = verify_access_token(data.access_token)
    if data.password is not None:
        # guessing the registration password through this endpoint is rate limited per account
        enforce(f"google-pw:{client_ip(request)}:{identity.email}", 10, 60)
    return _token_response(response, auth_service.google_sign_in(db, identity, data.password))


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=Message,
    dependencies=[Depends(rate_limit("register", 30, 60))],
)
def register(data: RegisterIn, db: DbSession) -> Message:
    auth_service.register(db, data)
    return Message(message="สมัครสมาชิกสำเร็จ ขั้นตอนสุดท้ายคือยืนยันอีเมลโดยเข้าสู่ระบบด้วย Google (@up.ac.th)")


@router.post(
    "/login",
    response_model=TokenOut,
    dependencies=[Depends(rate_limit("login", 300, 60))],
)
def login(data: LoginIn, request: Request, response: Response, db: DbSession) -> TokenOut:
    # brute-force protection per account (per-IP limit above only stops floods behind campus NAT)
    enforce(f"login:{client_ip(request)}:{data.email}", 10, 60)
    return _token_response(response, auth_service.login(db, data.email, data.password))


@router.post(
    "/refresh",
    response_model=TokenOut,
    dependencies=[Depends(check_origin), Depends(rate_limit("refresh", 1200, 60))],
)
def refresh(response: Response, db: DbSession, refresh_token: RefreshCookie = None) -> TokenOut:
    try:
        return _token_response(response, auth_service.refresh(db, refresh_token))
    except AppError:
        response.delete_cookie(REFRESH_COOKIE, path=_cookie_path())
        raise


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(check_origin)],
)
def logout(db: DbSession, refresh_token: RefreshCookie = None) -> Response:
    auth_service.logout(db, refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(REFRESH_COOKIE, path=_cookie_path())
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return user_out(user)


@router.post("/onboarding", response_model=UserOut)
def onboarding(data: OnboardingIn, user: CurrentUser, db: DbSession) -> UserOut:
    """First sign-in only: the account picks its faculty and programme (role follows the email)."""
    return user_out(auth_service.complete_onboarding(db, user, data))


@router.patch("/me", response_model=UserOut)
def update_me(data: ProfileUpdateIn, user: CurrentUser, db: DbSession) -> UserOut:
    if data.display_name is not None:
        ensure_clean(display_name=data.display_name)
    return user_out(auth_service.update_profile(db, user, data))
