"""Report flow, admin only. Exactly two actions:

* remove content  -> `content_removed` (soft-deletes the post, closes the other open reports on it)
* close without removal -> `dismissed`

Both are allowed from reported / under_review / upheld (the two latter are kept enum values for
reports created before this change). Every step is logged in report_actions and the reporter is
notified with a link to /reports/{id}. A soft-deleted post keeps its report history."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.permissions import has_permission
from app.models import (
    Post,
    PostStatus,
    RemovalReason,
    Report,
    ReportAction,
    ReportReason,
    ReportStatus,
    User,
)
from app.services.activity import audit, notify
from app.services.posts import get_visible_post, soft_delete
from app.validators.schemas import ReportCreateIn

S = ReportStatus
OPEN_STATUSES = [S.reported, S.under_review, S.upheld]
TRANSITIONS: dict[ReportStatus, set[ReportStatus]] = {
    S.reported: {S.content_removed, S.dismissed},
    S.under_review: {S.content_removed, S.dismissed},
    S.upheld: {S.content_removed, S.dismissed},
    S.content_removed: set(),
    S.dismissed: set(),
}
OUTCOME_TH = {
    S.content_removed: "โพสต์ที่คุณรายงานถูกนำออกแล้ว",
    S.dismissed: "ปิดรายงานแล้ว (ไม่ลบเนื้อหา)",
}


def create_report(db: Session, user: User, data: ReportCreateIn) -> Report:
    post = get_visible_post(db, data.post_id)
    if post.author_id == user.id:
        raise AppError(409, "CONFLICT", "You cannot report your own post")
    report = Report(
        post_id=post.id,
        reporter_id=user.id,
        reason=ReportReason(data.reason),
        detail=data.detail,
    )
    db.add(report)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "DUPLICATE_REPORT", "You have already reported this post") from exc
    db.commit()
    return db.get(Report, report.id)  # type: ignore[return-value]


def list_reports_stmt(status: ReportStatus | None):
    stmt = select(Report).order_by(Report.created_at.desc(), Report.id.desc())
    if status is not None:
        stmt = stmt.where(Report.status == status)
    return stmt


def my_reports_stmt(user: User):
    """The caller's own reports only (also those on posts removed since)."""
    return (
        select(Report)
        .where(Report.reporter_id == user.id)
        .order_by(Report.created_at.desc(), Report.id.desc())
    )


def get_report(db: Session, user: User, report_id: int) -> Report:
    """Owner or admin; anybody else gets a 404 (no existence leak)."""
    report = db.scalars(select(Report).where(Report.id == report_id)).unique().first()
    if report is None or not (
        report.reporter_id == user.id or has_permission(user, "report:manage")
    ):
        raise not_found("Report")
    return report


def transition(
    db: Session, admin: User, report_id: int, target: ReportStatus, note: str | None
) -> Report:
    # Lock only the reports row (eager-loaded outer joins cannot be locked).
    report = (
        db.scalars(select(Report).where(Report.id == report_id).with_for_update(of=Report))
        .unique()
        .first()
    )
    if report is None:
        raise not_found("Report")
    current = report.status
    if target not in TRANSITIONS[current]:
        raise AppError(
            409,
            "INVALID_TRANSITION",
            f"Cannot change report from {current.value} to {target.value}",
        )
    note = note or None
    report.status = target
    db.add(
        ReportAction(
            report_id=report.id,
            admin_id=admin.id,
            from_status=current,
            to_status=target,
            note=note,
        )
    )
    post: Post = report.post

    if target is S.content_removed and post.status is PostStatus.active:
        soft_delete(db, admin, post, RemovalReason.moderation)
        # Close every other open report on the same post and tell their reporters.
        others = (
            db.scalars(
                select(Report).where(
                    Report.post_id == post.id,
                    Report.id != report.id,
                    Report.status.in_(OPEN_STATUSES),
                )
            )
            .unique()
            .all()
        )
        for other in others:
            db.add(
                ReportAction(
                    report_id=other.id,
                    admin_id=admin.id,
                    from_status=other.status,
                    to_status=S.content_removed,
                    note="โพสต์ถูกนำออกจากรายงานอื่น",
                )
            )
            other.status = S.content_removed
            notify(
                db,
                [other.reporter_id],
                "report.updated",
                OUTCOME_TH[S.content_removed],
                post.title,
                f"/reports/{other.id}",
            )
        notify(
            db,
            [post.author_id],
            "post.removed",
            "โพสต์ของคุณถูกนำออกเนื่องจากละเมิดกฎชุมชน",
            post.title,
        )

    audit(
        db,
        admin,
        "report.transition",
        "report",
        report.id,
        {"from": current.value, "to": target.value},
    )
    notify(
        db,
        [report.reporter_id],
        "report.updated",
        OUTCOME_TH[target],
        post.title,
        f"/reports/{report.id}",
    )
    db.commit()
    db.expire_all()
    return db.get(Report, report_id)  # type: ignore[return-value]
