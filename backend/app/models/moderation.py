from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_column, pg_enum
from app.models.enums import PostType, ReportReason, ReportStatus, ViolationAction
from app.models.post import Post
from app.models.user import User


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (UniqueConstraint("post_id", "reporter_id", name="uq_reports_post_reporter"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"), index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reason: Mapped[ReportReason] = mapped_column(pg_enum(ReportReason, "report_reason"))
    detail: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[ReportStatus] = mapped_column(
        pg_enum(ReportStatus, "report_status"),
        default=ReportStatus.reported,
        index=True,
    )
    created_at: Mapped[datetime] = created_at_column()

    post: Mapped[Post] = relationship(lazy="joined")
    reporter: Mapped[User] = relationship(lazy="joined")
    actions: Mapped[list["ReportAction"]] = relationship(
        lazy="selectin", order_by="ReportAction.id", cascade="all, delete-orphan"
    )


class ReportAction(Base):
    __tablename__ = "report_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    from_status: Mapped[ReportStatus] = mapped_column(pg_enum(ReportStatus, "report_status"))
    to_status: Mapped[ReportStatus] = mapped_column(pg_enum(ReportStatus, "report_status"))
    note: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = created_at_column()

    admin: Mapped[User] = relationship(lazy="joined")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index(
            "ix_notifications_unread",
            "user_id",
            postgresql_where=text("read_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()


class AuditLog(Base):
    """ADR-001 audit trail: pins, deletions, role changes, assignments, status changes."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    entity: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int | None] = mapped_column()
    meta: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = created_at_column()


class PostingViolation(Base):
    """Spam policy history (ADR-003): one row per threshold reached by a series of consecutive
    general posts inside one Bangkok calendar day (3 -> warning, 5 -> suspension)."""

    __tablename__ = "posting_violations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    post_id: Mapped[int | None] = mapped_column(ForeignKey("posts.id", ondelete="SET NULL"))
    series_count: Mapped[int] = mapped_column(Integer)
    post_type: Mapped[PostType] = mapped_column(pg_enum(PostType, "post_type"))
    action: Mapped[ViolationAction] = mapped_column(pg_enum(ViolationAction, "violation_action"))
    reason: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = created_at_column()


class PostingSuspension(Base):
    __tablename__ = "posting_suspensions"
    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ends_after_starts"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    violation_id: Mapped[int | None] = mapped_column(
        ForeignKey("posting_violations.id", ondelete="SET NULL")
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # last suspended Bangkok calendar day (inclusive); ends_at = 00:00 Bangkok of the day after
    last_day: Mapped[date] = mapped_column(Date)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str] = mapped_column(String(200))
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lifted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
