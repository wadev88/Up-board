from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_column, pg_enum, updated_at_column
from app.models.enums import (
    AttachmentKind,
    EventPriority,
    LostFoundStatus,
    PostStatus,
    PostType,
    Priority,
    RemovalReason,
    RepairStatus,
)
from app.models.user import Faculty, Technician, User


class PostCategory(Base):
    __tablename__ = "post_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True)
    name_th: Mapped[str] = mapped_column(String(100))
    allowed_type: Mapped[PostType | None] = mapped_column(pg_enum(PostType, "post_type"))


class Post(Base):
    """Supertype for every board item (ADR-002): events, repairs and lost & found items
    are 1:1 extension tables keyed by post_id."""

    __tablename__ = "posts"
    __table_args__ = (
        CheckConstraint("char_length(title) BETWEEN 3 AND 150", name="title_length"),
        CheckConstraint("char_length(content) BETWEEN 1 AND 5000", name="content_length"),
        # pinned_until may be NULL: an announcement pinned for a repair stays pinned until that
        # repair is closed / rejected
        CheckConstraint(
            "(pinned_at IS NULL) = (pinned_by IS NULL) "
            "AND (pinned_until IS NULL OR (pinned_at IS NOT NULL AND pinned_until > pinned_at))",
            name="pin_fields_together",
        ),
        CheckConstraint(
            "related_repair_id IS NULL OR type = 'announcement'",
            name="related_repair_announcements_only",
        ),
        Index("ix_posts_status_created_at", "status", text("created_at DESC")),
        Index("ix_posts_author_created_at", "author_id", text("created_at DESC")),
        Index("ix_posts_category_created_at", "category_id", text("created_at DESC")),
        Index(
            "ix_posts_pinned_until",
            "pinned_until",
            postgresql_where=text("pinned_until IS NOT NULL"),
        ),
        Index(
            "ix_posts_search",
            text("to_tsvector('simple', title || ' ' || content)"),
            postgresql_using="gin",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[PostType] = mapped_column(pg_enum(PostType, "post_type"), index=True)
    title: Mapped[str] = mapped_column(String(150))
    content: Mapped[str] = mapped_column(Text)
    category_id: Mapped[int] = mapped_column(ForeignKey("post_categories.id"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    faculty_id: Mapped[int | None] = mapped_column(ForeignKey("faculties.id"), index=True)
    priority: Mapped[Priority] = mapped_column(
        pg_enum(Priority, "priority_level"), default=Priority.normal
    )
    status: Mapped[PostStatus] = mapped_column(
        pg_enum(PostStatus, "post_status"), default=PostStatus.active
    )
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pinned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pinned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    # announcements only: the repair post this announcement is about
    related_repair_id: Mapped[int | None] = mapped_column(
        ForeignKey("posts.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    removal_reason: Mapped[RemovalReason | None] = mapped_column(
        pg_enum(RemovalReason, "removal_reason")
    )

    category: Mapped[PostCategory] = relationship(lazy="joined")
    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="joined")
    faculty: Mapped[Faculty | None] = relationship(lazy="joined")
    # 1:1 extensions use selectin (separate small IN queries). As joined eager loads they pushed
    # the main SELECT to 13 JOINs, above PostgreSQL's geqo_threshold (12): planning took ~11 ms
    # vs ~0.8 ms execution and capped throughput under the NFR-11 load test.
    event: Mapped["Event | None"] = relationship(
        back_populates="post",
        lazy="selectin",
        uselist=False,
        cascade="all, delete-orphan",
    )
    repair: Mapped["RepairRequest | None"] = relationship(
        back_populates="post",
        lazy="selectin",
        uselist=False,
        cascade="all, delete-orphan",
    )
    lost_found: Mapped["LostFoundItem | None"] = relationship(
        back_populates="post",
        lazy="selectin",
        uselist=False,
        cascade="all, delete-orphan",
    )
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="post", lazy="selectin", order_by="Attachment.id"
    )


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name="ends_after_starts"),
        # ADR-003: required for every new event. Migration 0002 adds it NOT VALID so legacy rows
        # without an end are kept untouched (queries treat them as ended at starts_at).
        CheckConstraint("ends_at IS NOT NULL", name="ends_at_required"),
    )

    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    venue: Mapped[str | None] = mapped_column(String(200))
    priority_level: Mapped[EventPriority] = mapped_column(
        pg_enum(EventPriority, "event_priority"), default=EventPriority.department
    )

    post: Mapped[Post] = relationship(back_populates="event")


class RepairRequest(Base):
    __tablename__ = "repair_requests"
    __table_args__ = (
        CheckConstraint("latitude IS NULL OR latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint(
            "longitude IS NULL OR longitude BETWEEN -180 AND 180",
            name="longitude_range",
        ),
    )

    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    location: Mapped[str] = mapped_column(String(200))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    status: Mapped[RepairStatus] = mapped_column(
        pg_enum(RepairStatus, "repair_status"), default=RepairStatus.open, index=True
    )
    assigned_technician_id: Mapped[int | None] = mapped_column(
        ForeignKey("technicians.id"), index=True
    )
    updated_at: Mapped[datetime] = updated_at_column()

    post: Mapped[Post] = relationship(back_populates="repair")
    technician: Mapped[Technician | None] = relationship(lazy="joined")
    history: Mapped[list["RepairStatusHistory"]] = relationship(
        lazy="selectin", order_by="RepairStatusHistory.id", cascade="all, delete-orphan"
    )


class RepairStatusHistory(Base):
    __tablename__ = "repair_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    repair_id: Mapped[int] = mapped_column(
        ForeignKey("repair_requests.post_id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[RepairStatus | None] = mapped_column(pg_enum(RepairStatus, "repair_status"))
    to_status: Mapped[RepairStatus] = mapped_column(pg_enum(RepairStatus, "repair_status"))
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(String(500))
    changed_at: Mapped[datetime] = created_at_column()

    changer: Mapped[User | None] = relationship(lazy="joined")


class LostFoundItem(Base):
    __tablename__ = "lost_found_items"

    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    location: Mapped[str] = mapped_column(String(200))
    status: Mapped[LostFoundStatus] = mapped_column(
        pg_enum(LostFoundStatus, "lost_found_status"), index=True
    )
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = updated_at_column()

    post: Mapped[Post] = relationship(back_populates="lost_found")


class Attachment(Base):
    __tablename__ = "attachments"
    __table_args__ = (
        CheckConstraint(
            "mime_type IN ('image/jpeg','image/png','image/webp')",
            name="mime_type_allowed",
        ),
        CheckConstraint("size_bytes > 0 AND size_bytes <= 5242880", name="size_limit"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int | None] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), index=True
    )
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    storage_key: Mapped[str] = mapped_column(String(100), unique=True)
    mime_type: Mapped[str] = mapped_column(String(30))
    size_bytes: Mapped[int] = mapped_column(Integer)
    kind: Mapped[AttachmentKind] = mapped_column(
        pg_enum(AttachmentKind, "attachment_kind"), default=AttachmentKind.image
    )
    created_at: Mapped[datetime] = created_at_column()

    post: Mapped[Post | None] = relationship(back_populates="attachments")
