"""Registration, Google email verification, login, refresh-token rotation (ADR-001, ADR-003)."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.clock import utcnow
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    password_needs_rehash,
    verify_password,
)
from app.core.supabase_auth import SupabaseIdentity
from app.models import (
    Faculty,
    Program,
    RefreshToken,
    Role,
    RoleName,
    User,
)
from app.services.activity import audit
from app.validators.schemas import UP_EMAIL_RE, OnboardingIn, ProfileUpdateIn, RegisterIn


@dataclass
class IssuedTokens:
    access_token: str
    expires_in: int
    refresh_token: str
    user: User


def register(db: Session, data: RegisterIn) -> User:
    if not get_settings().password_signup_enabled:
        raise AppError(
            403, "PASSWORD_SIGNUP_DISABLED", "Please sign in with your Google @up.ac.th account"
        )
    faculty = _faculty_or_422(db, data.faculty_id, require_active=True)
    program = program_for_faculty(db, faculty.id, data.program_id)
    # The role follows the email (numeric student id → student, otherwise teacher); nobody can
    # pick staff/admin. Faculty + programme are given here, so no onboarding step is needed.
    role = db.scalars(select(Role).where(Role.name == role_from_email(data.email))).one()
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
        role_id=role.id,
        faculty_id=faculty.id,
        program_id=program.id,
        profile_completed_at=utcnow(),
        is_verified=False,
        is_active=True,
        token_version=0,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "EMAIL_TAKEN", "This email is already registered") from exc
    # No verification email: the mailbox is proven by the first Google sign-in (google_sign_in).
    audit(db, user, "user.register", "user", user.id)
    db.commit()
    return user


def _issue_tokens(db: Session, user: User, family_id: str | None = None) -> IssuedTokens:
    access_token, expires_in = create_access_token(
        user.id, user.role_name.value, user.token_version
    )
    refresh_token = new_opaque_token()
    db.add(
        RefreshToken(
            token_hash=hash_token(refresh_token),
            user_id=user.id,
            family_id=family_id or str(uuid.uuid4()),
            expires_at=utcnow() + timedelta(days=get_settings().refresh_token_ttl_days),
        )
    )
    return IssuedTokens(access_token, expires_in, refresh_token, user)


def google_sign_in(
    db: Session, identity: SupabaseIdentity, password: str | None = None
) -> IssuedTokens:
    """Google (via Supabase Auth) identity → our own session. Registration is mandatory first
    (a deliberate deviation from spec §2.1): Google never creates an account, it only signs in
    to one that already exists and is active — self-registered through the form, or created by
    an admin (building staff, technicians, clubs, admins) — and links it by the email Google
    verified. Unknown emails get 403 NOT_REGISTERED.

    Only @up.ac.th addresses may sign in, with ONE exception: a verified Google address that
    matches an existing, active, pre-registered `student_club` account (clubs may use e.g. a
    gmail address). An account already linked to a different Google user is never taken over.

    A successful Google sign-in is what verifies the mailbox. A self-registered account that is
    still unverified must also present its registration password once (PASSWORD_CONFIRMATION_
    REQUIRED): otherwise someone who registered another person's address could keep access after
    the real owner signs in with Google. Admin-created accounts (no password) need nothing."""
    is_up_email = bool(UP_EMAIL_RE.fullmatch(identity.email))
    supabase_id = uuid.UUID(identity.user_id)
    user = (
        db.scalars(select(User).where(User.supabase_user_id == supabase_id)).unique().first()
        or db.scalars(select(User).where(User.email == identity.email)).unique().first()
    )
    if not is_up_email and not (
        user is not None
        and user.is_active
        and user.role_name is RoleName.student_club
        and user.email.lower() == identity.email
    ):
        db.rollback()
        raise AppError(403, "EMAIL_DOMAIN_NOT_ALLOWED", "This email address cannot be used")
    if user is None:
        db.rollback()
        raise AppError(
            403, "NOT_REGISTERED", "No account for this email yet; please register first"
        )
    if not user.is_active:
        db.rollback()
        raise AppError(403, "ACCOUNT_DISABLED", "This account has been disabled")
    if user.supabase_user_id is not None and user.supabase_user_id != supabase_id:
        db.rollback()
        raise AppError(409, "CONFLICT", "This email is linked to a different Google account")
    if not user.is_verified and user.password_hash is not None:
        if password is None:
            db.rollback()
            raise AppError(
                403,
                "PASSWORD_CONFIRMATION_REQUIRED",
                "Enter the password you set when registering to verify this email",
            )
        if not verify_password(password, user.password_hash):
            db.rollback()
            raise AppError(
                403, "PASSWORD_CONFIRMATION_REQUIRED", "The registration password is incorrect"
            )
    user.supabase_user_id = supabase_id
    user.is_verified = True  # Google proved the email
    audit(db, user, "user.login_google", "user", user.id)
    tokens = _issue_tokens(db, user)
    db.commit()
    return tokens


def role_from_email(email: str) -> RoleName:
    """UP addresses: student ids are numeric (e.g. 67024841@up.ac.th), teachers and staff use
    names (e.g. somchai.j@up.ac.th). Admins correct the rare exception afterwards."""
    return RoleName.student if email[:1].isdigit() else RoleName.teacher


def _validation_error(field: str, message: str) -> AppError:
    return AppError(422, "VALIDATION_ERROR", message, [{"field": field, "message": message}])


def _faculty_or_422(db: Session, faculty_id: int, *, require_active: bool = False) -> Faculty:
    """Self-service lookup: admin-only faculties (university central / facilities) are refused."""
    faculty = db.get(Faculty, faculty_id)
    if faculty is None:
        raise _validation_error("faculty_id", "Unknown faculty")
    if faculty.admin_only:
        raise _validation_error("faculty_id", "This faculty can only be assigned by an admin")
    if require_active and not faculty.is_active:
        raise _validation_error("faculty_id", "This faculty is no longer available")
    return faculty


def program_for_faculty(
    db: Session, faculty_id: int | None, program_id: int, *, keep: int | None = None
) -> Program:
    """The programme must exist, belong to `faculty_id` and be active (the programme the user
    already has — `keep` — is accepted even after it was retired)."""
    program = db.get(Program, program_id)
    if program is None:
        raise _validation_error("program_id", "Unknown programme")
    if program.faculty.admin_only and program.id != keep:
        raise _validation_error("program_id", "This programme can only be assigned by an admin")
    if faculty_id is None or program.faculty_id != faculty_id:
        raise _validation_error("program_id", "This programme does not belong to the faculty")
    if not program.is_active and program.id != keep:
        raise _validation_error("program_id", "This programme is no longer available")
    return program


def clean_contact(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def update_profile(db: Session, user: User, data: ProfileUpdateIn) -> User:
    """Users fix their own name, faculty + programme and contacts without waiting for an admin.
    The role stays admin-managed. Changing the faculty needs a programme of the new faculty."""
    fields = data.model_fields_set
    faculty_changed = data.faculty_id is not None and data.faculty_id != user.faculty_id
    program_given = "program_id" in fields
    if faculty_changed or program_given:
        if faculty_changed:
            faculty = _faculty_or_422(db, data.faculty_id or 0, require_active=True)
            if data.program_id is None:
                raise _validation_error("program_id", "Choose a programme of the new faculty")
            program = program_for_faculty(db, faculty.id, data.program_id)
            user.faculty_id, user.program_id = faculty.id, program.id
        elif data.program_id is None:
            user.program_id = None  # explicit null: clear the programme
        else:
            program = program_for_faculty(
                db, user.faculty_id, data.program_id, keep=user.program_id
            )
            user.program_id = program.id
    if data.display_name is not None:
        user.display_name = data.display_name
    if data.contacts is not None:
        contacts = data.contacts
        if "facebook" in contacts.model_fields_set:
            user.contact_facebook = clean_contact(contacts.facebook)
        if "instagram" in contacts.model_fields_set:
            user.contact_instagram = clean_contact(contacts.instagram)
        if "line" in contacts.model_fields_set:
            user.contact_line = clean_contact(contacts.line)
    db.commit()
    db.expire_all()
    return db.get(User, user.id)  # type: ignore[return-value]


def complete_onboarding(db: Session, user: User, data: OnboardingIn) -> User:
    """First sign-in of a self-registered account: the role follows the email, the user adds the
    faculty and programme. One-time only — afterwards an admin changes it."""
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    db.refresh(user, attribute_names=["profile_completed_at"])
    if user.profile_completed_at is not None:
        raise AppError(409, "CONFLICT", "Your profile is already set up; ask an admin to change it")
    faculty = _faculty_or_422(db, data.faculty_id, require_active=True)
    program = program_for_faculty(db, faculty.id, data.program_id)
    role_name = role_from_email(user.email)
    role = db.scalars(select(Role).where(Role.name == role_name)).one()
    user.role_id = role.id
    user.faculty_id = faculty.id
    user.program_id = program.id
    user.profile_completed_at = utcnow()
    audit(
        db,
        user,
        "user.onboarding",
        "user",
        user.id,
        {"role": role_name.value, "faculty_id": faculty.id, "program_id": program.id},
    )
    db.commit()
    db.expire_all()
    return db.get(User, user.id)  # type: ignore[return-value]


def login(db: Session, email: str, password: str) -> IssuedTokens:
    user = db.scalars(select(User).where(User.email == email)).unique().first()
    if not verify_password(password, user.password_hash if user else None) or user is None:
        raise AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect")
    if not user.is_active:
        raise AppError(403, "ACCOUNT_DISABLED", "This account has been disabled")
    if not user.is_verified:
        raise AppError(
            403, "EMAIL_NOT_VERIFIED", "Verify your email by signing in with Google first"
        )
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    tokens = _issue_tokens(db, user)
    db.commit()
    return tokens


ROTATION_GRACE = timedelta(seconds=30)


def _is_concurrent_rotation(db: Session, record: RefreshToken, now: datetime) -> bool:
    """Several tabs refreshing at the same moment send the same (just-rotated) cookie.
    Accept that within a short grace window while the family still has a live token;
    after logout (no live token) or outside the window it is treated as theft."""
    if record.revoked_at is None or now - record.revoked_at > ROTATION_GRACE:
        return False
    live = db.scalar(
        select(RefreshToken.token_hash).where(
            RefreshToken.family_id == record.family_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
    )
    return live is not None


def refresh(db: Session, raw_token: str | None) -> IssuedTokens:
    if not raw_token:
        raise AppError(401, "UNAUTHENTICATED", "Missing refresh token")
    now = utcnow()
    record = db.get(RefreshToken, hash_token(raw_token), with_for_update=True)
    if record is None:
        raise AppError(401, "UNAUTHENTICATED", "Invalid refresh token")
    if record.revoked_at is not None and not _is_concurrent_rotation(db, record, now):
        # Reuse of a rotated token = likely theft → revoke the whole family.
        db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.family_id == record.family_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )
        db.commit()
        raise AppError(401, "UNAUTHENTICATED", "Refresh token reuse detected; please sign in again")
    if record.expires_at <= now:
        raise AppError(401, "TOKEN_EXPIRED", "Session expired; please sign in again")
    user = db.get(User, record.user_id)
    if user is None or not user.is_active or not user.is_verified:
        raise AppError(401, "UNAUTHENTICATED", "Session is no longer valid")
    if record.revoked_at is None:
        record.revoked_at = now
    tokens = _issue_tokens(db, user, family_id=record.family_id)
    db.commit()
    return tokens


def logout(db: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    record = db.get(RefreshToken, hash_token(raw_token))
    if record is not None and record.revoked_at is None:
        db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.family_id == record.family_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=utcnow())
        )
        db.commit()


def revoke_all_sessions(db: Session, user: User) -> None:
    """Invalidate every JWT (token_version) and refresh token of a user. Caller commits."""
    user.token_version += 1
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
