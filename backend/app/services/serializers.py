"""ORM → response schema conversion. Field-level privacy for repairs (ADR-002 decision 5) is
applied HERE, on the backend: public viewers never receive reporter, GPS, technician name or
internal notes."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import object_session

from app.core import clock
from app.core.permissions import can_read_repair_private, post_permissions
from app.core.storage import get_storage
from app.models import (
    Attachment,
    Faculty,
    Post,
    PostingSuspension,
    PostType,
    Program,
    Report,
    RoleName,
    Technician,
    User,
)
from app.services.expiration import feed_expires_at, is_pinned, post_lifecycle, repair_is_active
from app.validators.schemas import (
    AttachmentOut,
    CategoryOut,
    ContactsOut,
    EventOut,
    FacultyOut,
    LostFoundOut,
    PostOut,
    PostPermissions,
    ProgramOut,
    RepairHistoryOut,
    RepairOut,
    ReportActionOut,
    ReportOut,
    ReportPostBrief,
    SuspensionOut,
    TechnicianBrief,
    TechnicianOut,
    UserBrief,
    UserOut,
    UserPublicOut,
)

DELETED_USER_NAME = "บัญชีที่ถูกลบ"


def shown_name(user: User) -> str:
    """Deleted accounts keep their row (history) but never show their old name."""
    return DELETED_USER_NAME if user.deleted_at is not None else user.display_name


def user_brief(user: User) -> UserBrief:
    return UserBrief(id=user.id, display_name=shown_name(user), role=user.role_name)


def faculty_out(
    faculty: Faculty | None, programs: list[Program] | None = None
) -> FacultyOut | None:
    """Nested faculties never load their programmes (empty list); the catalog passes them in."""
    if faculty is None:
        return None
    return FacultyOut(
        id=faculty.id,
        code=faculty.code,
        name_th=faculty.name_th,
        name_en=faculty.name_en,
        is_active=faculty.is_active,
        admin_only=faculty.admin_only,
        programs=[program_out(p) for p in programs or []],  # type: ignore[misc]
    )


def program_out(program: Program | None) -> ProgramOut | None:
    return ProgramOut.model_validate(program) if program is not None else None


def contacts_out(user: User) -> ContactsOut:
    return ContactsOut(
        facebook=user.contact_facebook,
        instagram=user.contact_instagram,
        line=user.contact_line,
    )


def _active_suspension(user: User, until: datetime, now: datetime) -> SuspensionOut | None:
    session = object_session(user)
    if session is None:
        return None
    row = session.scalars(
        select(PostingSuspension)
        .where(
            PostingSuspension.user_id == user.id,
            PostingSuspension.lifted_at.is_(None),
            PostingSuspension.starts_at <= now,
            PostingSuspension.ends_at > now,
        )
        .order_by(PostingSuspension.ends_at.desc())
        .limit(1)
    ).first()
    if row is None:
        return None
    return SuspensionOut(starts_at=row.starts_at, last_day=row.last_day, ends_at=row.ends_at)


def user_out(user: User) -> UserOut:
    now = clock.utcnow()
    suspended_until = user.posting_suspended_until
    if suspended_until is not None and suspended_until <= now:
        suspended_until = None
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role_name,
        faculty=faculty_out(user.faculty),
        program=program_out(user.program),
        contacts=contacts_out(user),
        is_verified=user.is_verified,
        is_active=user.is_active,
        is_technician=user.role_name is RoleName.technician
        and user.technician is not None
        and user.technician.is_available,
        has_password=user.password_hash is not None,
        profile_completed=user.profile_completed_at is not None,
        posting_suspended_until=suspended_until,
        suspension=_active_suspension(user, suspended_until, now) if suspended_until else None,
        created_at=user.created_at,
    )


def user_public_out(user: User) -> UserPublicOut:
    return UserPublicOut(
        id=user.id,
        display_name=shown_name(user),
        role=user.role_name,
        faculty=faculty_out(user.faculty),
        program=program_out(user.program),
        contacts=contacts_out(user),
    )


def attachment_out(attachment: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=attachment.id,
        url=get_storage().public_url(attachment.storage_key),
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
        kind=attachment.kind.value,
    )


def _repair_out(post: Post, private: bool) -> RepairOut | None:
    repair = post.repair
    if repair is None:
        return None
    technician = repair.technician
    return RepairOut(
        location=repair.location,
        status=repair.status,
        is_assigned=technician is not None,
        updated_at=repair.updated_at,
        latitude=float(repair.latitude) if private and repair.latitude is not None else None,
        longitude=float(repair.longitude) if private and repair.longitude is not None else None,
        technician=(
            TechnicianBrief(id=technician.id, display_name=shown_name(technician.user))
            if private and technician is not None
            else None
        ),
        history=[
            RepairHistoryOut(
                from_status=item.from_status,
                to_status=item.to_status,
                changed_at=item.changed_at,
                note=item.note if private else None,
                changed_by=user_brief(item.changer) if private and item.changer else None,
            )
            for item in repair.history
        ],
    )


def _related_active(post: Post) -> bool:
    if post.type is not PostType.announcement or post.related_repair_id is None:
        return False
    session = object_session(post)
    related = session.get(Post, post.related_repair_id) if session else None
    return repair_is_active(related) and related is not None and related.status.value == "active"


def post_out(post: Post, viewer: User, now: datetime) -> PostOut:
    is_repair = post.type is PostType.repair
    private = not is_repair or can_read_repair_private(viewer, post)
    return PostOut(
        id=post.id,
        type=post.type,
        title=post.title,
        content=post.content,
        priority=post.priority,
        status=post.status.value,
        category=CategoryOut.model_validate(post.category),
        faculty=faculty_out(post.faculty),
        author=user_brief(post.author) if private else None,
        created_at=post.created_at,
        updated_at=post.updated_at,
        pinned_at=post.pinned_at,
        pinned_until=post.pinned_until,
        is_pinned=is_pinned(post.pinned_at, post.pinned_until, now),
        dashboard_expires_at=feed_expires_at(post),
        lifecycle=post_lifecycle(post, now, _related_active(post)),
        attachments=[attachment_out(a) for a in post.attachments],
        event=EventOut.model_validate(post.event) if post.event else None,
        repair=_repair_out(post, private),
        lost_found=LostFoundOut.model_validate(post.lost_found) if post.lost_found else None,
        permissions=PostPermissions(**post_permissions(viewer, post)),
        related_repair_id=post.related_repair_id,
    )


def technician_out(technician: Technician) -> TechnicianOut:
    return TechnicianOut(
        id=technician.id,
        user=user_brief(technician.user),
        specialty=technician.specialty,
        zone=technician.zone,
        is_available=technician.is_available,
    )


def report_out(report: Report) -> ReportOut:
    return ReportOut(
        id=report.id,
        reason=report.reason,
        detail=report.detail,
        status=report.status,
        created_at=report.created_at,
        post=ReportPostBrief(
            id=report.post.id,
            title=report.post.title,
            type=report.post.type,
            status=report.post.status.value,
        ),
        reporter=user_brief(report.reporter),
        actions=[
            ReportActionOut(
                id=action.id,
                admin=user_brief(action.admin),
                from_status=action.from_status,
                to_status=action.to_status,
                note=action.note,
                created_at=action.created_at,
            )
            for action in report.actions
        ],
    )
