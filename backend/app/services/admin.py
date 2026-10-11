from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.core.errors import AppError, not_found
from app.core.permissions import FACULTY_REQUIRED_ROLES
from app.models import (
    ACTIVE_REPAIR_STATUSES,
    Faculty,
    Notification,
    Post,
    PostStatus,
    Program,
    RemovalReason,
    RepairRequest,
    RepairStatus,
    Report,
    ReportAction,
    ReportStatus,
    Role,
    RoleName,
    Technician,
    User,
)
from app.repositories.posts import like_pattern
from app.services import spam
from app.services.activity import audit, notify
from app.services.auth import revoke_all_sessions
from app.services.posts import soft_delete
from app.validators.schemas import (
    UP_EMAIL_RE,
    AdminStatsOut,
    AdminUserCreateIn,
    AdminUserUpdateIn,
)


def stats(db: Session) -> AdminStatsOut:
    since = utcnow() - timedelta(hours=24)
    return AdminStatsOut(
        users_total=db.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None))) or 0,
        posts_today=db.scalar(
            select(func.count(Post.id)).where(
                Post.created_at >= since, Post.status == PostStatus.active
            )
        )
        or 0,
        open_reports=db.scalar(
            select(func.count(Report.id)).where(
                Report.status.in_(
                    [
                        ReportStatus.reported,
                        ReportStatus.under_review,
                        ReportStatus.upheld,
                    ]
                )
            )
        )
        or 0,
        pending_repairs=db.scalar(
            select(func.count(RepairRequest.post_id))
            .join(Post, Post.id == RepairRequest.post_id)
            .where(
                RepairRequest.status.in_(ACTIVE_REPAIR_STATUSES),
                Post.status == PostStatus.active,
            )
        )
        or 0,
    )


def list_users_stmt(role: RoleName | None, q: str | None, suspended: bool | None = None):
    stmt = (
        select(User)
        .join(Role, Role.id == User.role_id)
        .where(User.deleted_at.is_(None))  # soft-deleted accounts are hidden
        .order_by(User.created_at.desc(), User.id.desc())
    )
    if role is not None:
        stmt = stmt.where(Role.name == role)
    if suspended is True:  # active posting suspension only
        stmt = stmt.where(User.posting_suspended_until > utcnow())
    elif suspended is False:
        stmt = stmt.where(
            User.posting_suspended_until.is_(None) | (User.posting_suspended_until <= utcnow())
        )
    if q:
        pattern = like_pattern(q)
        stmt = stmt.where(User.email.ilike(pattern) | User.display_name.ilike(pattern))
    return stmt


def _ensure_faculty(db: Session, faculty_id: int | None) -> None:
    if faculty_id is not None and db.get(Faculty, faculty_id) is None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Unknown faculty",
            [{"field": "faculty_id", "message": "Unknown faculty"}],
        )


def _check_role_fields(db: Session, user: User) -> None:
    if user.role_name in FACULTY_REQUIRED_ROLES and user.faculty_id is None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Teachers must belong to a faculty",
            [{"field": "faculty_id", "message": "required for this role"}],
        )
    if user.program_id is not None:
        program = db.get(Program, user.program_id)
        if program is None or program.faculty_id != user.faculty_id:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "The programme does not belong to the faculty",
                [{"field": "program_id", "message": "must belong to the faculty"}],
            )


def _ensure_program(db: Session, program_id: int | None) -> None:
    if program_id is not None and db.get(Program, program_id) is None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Unknown programme",
            [{"field": "program_id", "message": "Unknown programme"}],
        )


def ensure_email_for_role(email: str, role: RoleName) -> None:
    """Admin-created accounts need an @up.ac.th address, except student_club accounts (clubs,
    unions, ... may use any valid email such as a gmail address)."""
    if role is not RoleName.student_club and not UP_EMAIL_RE.fullmatch(email):
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Email must be a University of Phayao address ending with @up.ac.th "
            "(only student_club accounts may use another address)",
            [{"field": "email", "message": "must end with @up.ac.th for this role"}],
        )


def _sync_technician(db: Session, user: User, specialty: str | None, zone: str | None) -> None:
    """The technician profile follows the role: created / re-enabled for technicians,
    disabled otherwise."""
    if user.role_name is RoleName.technician:
        technician = user.technician or Technician(user_id=user.id, is_available=True)
        if user.technician is None:
            db.add(technician)
        technician.is_available = True
        if specialty is not None:
            technician.specialty = specialty or None
        if zone is not None:
            technician.zone = zone or None
    else:
        if specialty or zone:
            raise AppError(422, "VALIDATION_ERROR", "Only technicians have a specialty / zone")
        if user.technician is not None and user.technician.is_available:
            user.technician.is_available = False


def create_user(db: Session, admin: User, data: AdminUserCreateIn) -> User:
    """Admin-created account for a dedicated address (building staff, technicians, clubs,
    admins, ...): @up.ac.th, or any valid email for student_club. No password: the owner signs in
    with Google using this address and is linked by email, keeping the role chosen here (no
    onboarding)."""
    ensure_email_for_role(data.email, data.role)
    _ensure_faculty(db, data.faculty_id)
    _ensure_program(db, data.program_id)
    role = db.scalars(select(Role).where(Role.name == data.role)).one()
    user = User(
        email=data.email,
        password_hash=None,
        display_name=data.display_name,
        role_id=role.id,
        faculty_id=data.faculty_id,
        program_id=data.program_id,
        is_verified=True,  # the address is proven by Google at the first sign-in
        is_active=True,
        token_version=0,
        profile_completed_at=utcnow(),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "EMAIL_TAKEN", "This email is already registered") from exc
    db.refresh(user, attribute_names=["role", "faculty"])
    _check_role_fields(db, user)
    _sync_technician(db, user, data.technician_specialty, data.technician_zone)
    audit(db, admin, "user.create", "user", user.id, {"role": data.role.value})
    db.commit()
    db.expire_all()
    return db.get(User, user.id)  # type: ignore[return-value]


def update_user(db: Session, admin: User, user_id: int, data: AdminUserUpdateIn) -> User:
    """Only admins reach this (user:manage). Every role change — including granting or revoking
    student_club — is written to audit_logs as `user.role_change` (ADR-003 / BR-08)."""
    # lock only the users row (FOR UPDATE cannot cover the eager-loaded outer joins)
    db.execute(select(User.id).where(User.id == user_id).with_for_update())
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise not_found("User")
    changes: dict[str, object] = {}
    revoke = False

    # `faculty_id` omitted → unchanged; explicit null → clear (some roles still need one below)
    if "faculty_id" in data.model_fields_set and data.faculty_id != user.faculty_id:
        _ensure_faculty(db, data.faculty_id)
        changes["faculty_id"] = [user.faculty_id, data.faculty_id]
        user.faculty_id = data.faculty_id
        if "program_id" not in data.model_fields_set and user.program_id is not None:
            changes["program_id"] = [user.program_id, None]  # the old programme no longer fits
            user.program_id = None

    if "program_id" in data.model_fields_set and data.program_id != user.program_id:
        _ensure_program(db, data.program_id)
        changes["program_id"] = [user.program_id, data.program_id]
        user.program_id = data.program_id

    if data.role is not None and data.role is not user.role_name:
        if user.id == admin.id:
            raise AppError(409, "CONFLICT", "Admins cannot change their own role")
        previous_role = user.role_name
        role = db.scalars(select(Role).where(Role.name == data.role)).one()
        changes["role"] = [previous_role.value, data.role.value]
        user.role_id = role.id
        db.flush()
        db.refresh(user, attribute_names=["role"])
        revoke = True
        audit(
            db,
            admin,
            "user.role_change",
            "user",
            user.id,
            {"from": previous_role.value, "to": data.role.value},
        )

    if changes.get("role") and user.profile_completed_at is None:
        user.profile_completed_at = utcnow()  # the admin decided the role: skip onboarding
    _check_role_fields(db, user)

    if data.is_active is not None and data.is_active != user.is_active:
        if user.id == admin.id:
            raise AppError(409, "CONFLICT", "Admins cannot deactivate themselves")
        changes["is_active"] = [user.is_active, data.is_active]
        user.is_active = data.is_active
        revoke = revoke or not data.is_active

    if data.is_verified is not None and data.is_verified != user.is_verified:
        changes["is_verified"] = [user.is_verified, data.is_verified]
        user.is_verified = data.is_verified
        revoke = revoke or not data.is_verified

    _sync_technician(db, user, data.technician_specialty, data.technician_zone)

    if data.lift_suspension and spam.lift_suspension(db, admin, user):
        changes["posting_suspension"] = "lifted"

    if revoke:
        revoke_all_sessions(db, user)
    if changes:
        audit(db, admin, "user.update", "user", user.id, changes)
    db.commit()
    db.expire_all()
    return db.get(User, user.id)  # type: ignore[return-value]


UNFINISHED_REPAIR_STATUSES = (
    RepairStatus.assigned,
    RepairStatus.in_progress,
    RepairStatus.pending_review,
)


def delete_user(db: Session, admin: User, user_id: int) -> None:
    """Soft delete (rows are kept for audit: posts, reports and audit entries reference the user).
    The account is disabled, its sessions revoked, its e-mail freed (rewritten to a unique
    placeholder; the original is kept in the audit log), its Google link and contacts cleared,
    its notifications deleted, and EVERY post it created is removed for everyone (reason
    `account_deleted`). The same person may register again later: that is a brand-new account."""
    if user_id == admin.id:
        raise AppError(409, "CONFLICT", "ไม่สามารถลบบัญชีของตัวเองได้")
    # lock the users row first so concurrent deletes / updates serialise
    db.execute(select(User.id).where(User.id == user_id).with_for_update())
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise not_found("User")

    if user.role_name is RoleName.admin and user.is_active:
        other_admins = db.scalar(
            select(func.count(User.id))
            .join(Role, Role.id == User.role_id)
            .where(
                Role.name == RoleName.admin,
                User.is_active,
                User.deleted_at.is_(None),
                User.id != user.id,
            )
        )
        if not other_admins:
            raise AppError(409, "CONFLICT", "ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้")

    if user.technician is not None:
        unfinished = db.scalar(
            select(func.count(RepairRequest.post_id))
            .join(Post, Post.id == RepairRequest.post_id)
            .where(
                Post.status == PostStatus.active,  # a removed repair is no job any more
                RepairRequest.assigned_technician_id == user.technician.id,
                RepairRequest.status.in_(UNFINISHED_REPAIR_STATUSES),
            )
        )
        if unfinished:
            raise AppError(
                409,
                "TECHNICIAN_HAS_ACTIVE_REPAIRS",
                f"ช่างคนนี้ยังมีงานซ่อมที่ยังไม่เสร็จ {unfinished} รายการ โปรดมอบหมายงานให้ช่างคนอื่นก่อนลบบัญชี",
            )

    original_email = user.email
    user.deleted_at = utcnow()
    user.deleted_by = admin.id
    user.is_active = False
    user.email = f"deleted-{user.id}@deleted.invalid"
    user.password_hash = None
    user.supabase_user_id = None
    user.contact_facebook = None
    user.contact_instagram = None
    user.contact_line = None
    if user.technician is not None:
        user.technician.is_available = False
    revoke_all_sessions(db, user)
    posts_removed = _remove_all_posts(db, admin, user)
    db.execute(delete(Notification).where(Notification.user_id == user.id))
    audit(
        db,
        admin,
        "user.delete",
        "user",
        user.id,
        {
            "email": original_email,
            "display_name": user.display_name,
            "role": user.role_name.value,
            "posts_removed": posts_removed,
        },
    )
    db.commit()


def _remove_all_posts(db: Session, admin: User, user: User) -> int:
    """Soft-delete every active post of the author (any type) in the caller's transaction, close
    the open reports on them (without notifying the deleted user) and tell a technician whose
    repair job was withdrawn. Returns the number of posts removed."""
    posts = (
        db.scalars(
            select(Post)
            .where(Post.author_id == user.id, Post.status == PostStatus.active)
            .with_for_update(of=Post)
        )
        .unique()
        .all()
    )
    # archived lost & found items are no longer anybody's history either
    db.execute(
        update(Post)
        .where(
            Post.author_id == user.id,
            Post.status == PostStatus.removed,
            Post.removal_reason == RemovalReason.lost_found_expired,
        )
        .values(removal_reason=RemovalReason.account_deleted)
    )
    for post in posts:
        repair = post.repair
        if (
            repair is not None
            and repair.status in UNFINISHED_REPAIR_STATUSES
            and repair.assigned_technician_id is not None
        ):
            technician = db.get(Technician, repair.assigned_technician_id)
            if technician is not None:
                notify(
                    db,
                    [technician.user_id],
                    "repair.cancelled",
                    f"งานซ่อม #{post.id} ถูกยกเลิก",
                    f"{post.title}\nผู้แจ้งถูกลบบัญชี งานนี้ถูกถอนออกจากระบบแล้ว",
                )
        soft_delete(db, admin, post, RemovalReason.account_deleted)

    open_reports = (
        db.scalars(
            select(Report).where(
                Report.post_id.in_(select(Post.id).where(Post.author_id == user.id)),
                Report.status.in_(
                    (ReportStatus.reported, ReportStatus.under_review, ReportStatus.upheld)
                ),
            )
        )
        .unique()
        .all()
    )
    for report in open_reports:
        db.add(
            ReportAction(
                report_id=report.id,
                admin_id=admin.id,
                from_status=report.status,
                to_status=ReportStatus.content_removed,
                note="บัญชีถูกลบ",
            )
        )
        report.status = ReportStatus.content_removed
    return len(posts)
