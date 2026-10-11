"""initial schema — UP Board core tables (ADR-001, ADR-002)

Business-rule constraints enforced in the database:
- users.email must end with @up.ac.th
- posts.pinned_until <= first_pinned_at + 72 hours (pin can never exceed 72h)
- attachments limited to jpeg/png/webp and 5 MB

Revision ID: 0001
Revises:
Create Date: 2026-10-05 07:42:08.405656+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ENUM_TYPES = (
    "post_type",
    "role_name",
    "permission_scope",
    "priority_level",
    "post_status",
    "attachment_kind",
    "lost_found_status",
    "repair_status",
    "report_reason",
    "report_status",
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.create_table(
        "faculties",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name_th", sa.String(length=200), nullable=False),
        sa.Column("name_en", sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_faculties")),
        sa.UniqueConstraint("code", name=op.f("uq_faculties_code")),
    )
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_permissions")),
        sa.UniqueConstraint("code", name=op.f("uq_permissions_code")),
    )
    op.create_table(
        "post_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("name_th", sa.String(length=100), nullable=False),
        sa.Column(
            "allowed_type",
            sa.Enum("general", "announcement", "repair", "lost_found", name="post_type"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_post_categories")),
        sa.UniqueConstraint("slug", name=op.f("uq_post_categories_slug")),
    )
    op.create_table(
        "roles",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("name", sa.Enum("student", "staff", "admin", name="role_name"), nullable=False),
        sa.Column("weight", sa.SmallInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("name", name=op.f("uq_roles_name")),
    )
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.SmallInteger(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.Column(
            "scope", sa.Enum("own", "faculty", "any", name="permission_scope"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["permission_id"],
            ["permissions.id"],
            name=op.f("fk_role_permissions_permission_id_permissions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name=op.f("fk_role_permissions_role_id_roles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("role_id", "permission_id", name=op.f("pk_role_permissions")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(length=60), nullable=False),
        sa.Column("role_id", sa.SmallInteger(), nullable=False),
        sa.Column("faculty_id", sa.Integer(), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "email ~* '^[A-Za-z0-9._%+-]+@up\\.ac\\.th$'", name=op.f("ck_users_email_up_domain")
        ),
        sa.ForeignKeyConstraint(
            ["faculty_id"], ["faculties.id"], name=op.f("fk_users_faculty_id_faculties")
        ),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], name=op.f("fk_users_role_id_roles")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("entity", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name=op.f("fk_audit_logs_actor_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_audit_logs_actor_id"), "audit_logs", ["actor_id"], unique=False)
    op.create_table(
        "email_verification_tokens",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_email_verification_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_email_verification_tokens")),
    )
    op.create_index(
        op.f("ix_email_verification_tokens_user_id"),
        "email_verification_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link", sa.String(length=300), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_notifications_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index(
        "ix_notifications_unread",
        "notifications",
        ["user_id"],
        unique=False,
        postgresql_where=sa.text("read_at IS NULL"),
    )
    op.create_index(op.f("ix_notifications_user_id"), "notifications", ["user_id"], unique=False)
    op.create_table(
        "posts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("general", "announcement", "repair", "lost_found", name="post_type"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("faculty_id", sa.Integer(), nullable=True),
        sa.Column(
            "priority",
            sa.Enum("low", "normal", "high", "urgent", name="priority_level"),
            nullable=False,
        ),
        sa.Column("status", sa.Enum("active", "removed", name="post_status"), nullable=False),
        sa.Column("first_pinned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pinned_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pinned_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "pinned_until IS NULL OR (first_pinned_at IS NOT NULL AND pinned_until <= first_pinned_at + INTERVAL '72 hours')",
            name=op.f("ck_posts_pin_max_72h"),
        ),
        sa.CheckConstraint(
            "(pinned_at IS NULL) = (pinned_until IS NULL)", name=op.f("ck_posts_pin_pair")
        ),
        sa.CheckConstraint(
            "char_length(content) BETWEEN 1 AND 5000", name=op.f("ck_posts_content_length")
        ),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 3 AND 150", name=op.f("ck_posts_title_length")
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], name=op.f("fk_posts_author_id_users")),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["post_categories.id"],
            name=op.f("fk_posts_category_id_post_categories"),
        ),
        sa.ForeignKeyConstraint(
            ["faculty_id"], ["faculties.id"], name=op.f("fk_posts_faculty_id_faculties")
        ),
        sa.ForeignKeyConstraint(["pinned_by"], ["users.id"], name=op.f("fk_posts_pinned_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_posts")),
    )
    op.create_index(op.f("ix_posts_author_id"), "posts", ["author_id"], unique=False)
    op.create_index(
        "ix_posts_category_created_at",
        "posts",
        ["category_id", sa.literal_column("created_at DESC")],
        unique=False,
    )
    op.create_index(op.f("ix_posts_faculty_id"), "posts", ["faculty_id"], unique=False)
    op.create_index(
        "ix_posts_pinned_until",
        "posts",
        ["pinned_until"],
        unique=False,
        postgresql_where=sa.text("pinned_until IS NOT NULL"),
    )
    op.create_index(
        "ix_posts_search",
        "posts",
        [sa.literal_column("to_tsvector('simple', title || ' ' || content)")],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_posts_status_created_at",
        "posts",
        ["status", sa.literal_column("created_at DESC")],
        unique=False,
    )
    op.create_index(op.f("ix_posts_type"), "posts", ["type"], unique=False)
    op.create_table(
        "refresh_tokens",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.String(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_refresh_tokens")),
    )
    op.create_index(
        op.f("ix_refresh_tokens_family_id"), "refresh_tokens", ["family_id"], unique=False
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)
    op.create_table(
        "technicians",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("specialty", sa.String(length=100), nullable=True),
        sa.Column("zone", sa.String(length=100), nullable=True),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_technicians_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_technicians")),
        sa.UniqueConstraint("user_id", name=op.f("uq_technicians_user_id")),
    )
    op.create_table(
        "attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=100), nullable=False),
        sa.Column("mime_type", sa.String(length=30), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("kind", sa.Enum("image", "repair_after", name="attachment_kind"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "mime_type IN ('image/jpeg','image/png','image/webp')",
            name=op.f("ck_attachments_mime_type_allowed"),
        ),
        sa.CheckConstraint(
            "size_bytes > 0 AND size_bytes <= 5242880", name=op.f("ck_attachments_size_limit")
        ),
        sa.ForeignKeyConstraint(
            ["post_id"], ["posts.id"], name=op.f("fk_attachments_post_id_posts"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"], ["users.id"], name=op.f("fk_attachments_uploaded_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attachments")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_attachments_storage_key")),
    )
    op.create_index(op.f("ix_attachments_post_id"), "attachments", ["post_id"], unique=False)
    op.create_index(
        op.f("ix_attachments_uploaded_by"), "attachments", ["uploaded_by"], unique=False
    )
    op.create_table(
        "events",
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("venue", sa.String(length=200), nullable=True),
        sa.CheckConstraint(
            "ends_at IS NULL OR ends_at > starts_at", name=op.f("ck_events_ends_after_starts")
        ),
        sa.ForeignKeyConstraint(
            ["post_id"], ["posts.id"], name=op.f("fk_events_post_id_posts"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("post_id", name=op.f("pk_events")),
    )
    op.create_index(op.f("ix_events_starts_at"), "events", ["starts_at"], unique=False)
    op.create_table(
        "lost_found_items",
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=False),
        sa.Column(
            "status", sa.Enum("lost", "found", "returned", name="lost_found_status"), nullable=False
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["post_id"],
            ["posts.id"],
            name=op.f("fk_lost_found_items_post_id_posts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("post_id", name=op.f("pk_lost_found_items")),
    )
    op.create_index(
        op.f("ix_lost_found_items_status"), "lost_found_items", ["status"], unique=False
    )
    op.create_table(
        "repair_requests",
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=False),
        sa.Column("latitude", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("longitude", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "accepted", "in_progress", "completed", name="repair_status"),
            nullable=False,
        ),
        sa.Column("assigned_technician_id", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "latitude IS NULL OR latitude BETWEEN -90 AND 90",
            name=op.f("ck_repair_requests_latitude_range"),
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR longitude BETWEEN -180 AND 180",
            name=op.f("ck_repair_requests_longitude_range"),
        ),
        sa.ForeignKeyConstraint(
            ["assigned_technician_id"],
            ["technicians.id"],
            name=op.f("fk_repair_requests_assigned_technician_id_technicians"),
        ),
        sa.ForeignKeyConstraint(
            ["post_id"],
            ["posts.id"],
            name=op.f("fk_repair_requests_post_id_posts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("post_id", name=op.f("pk_repair_requests")),
    )
    op.create_index(
        op.f("ix_repair_requests_assigned_technician_id"),
        "repair_requests",
        ["assigned_technician_id"],
        unique=False,
    )
    op.create_index(op.f("ix_repair_requests_status"), "repair_requests", ["status"], unique=False)
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("reporter_id", sa.Integer(), nullable=False),
        sa.Column(
            "reason",
            sa.Enum(
                "profanity", "spam", "harassment", "misinformation", "other", name="report_reason"
            ),
            nullable=False,
        ),
        sa.Column("detail", sa.String(length=1000), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "reported",
                "under_review",
                "upheld",
                "content_removed",
                "dismissed",
                name="report_status",
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], name=op.f("fk_reports_post_id_posts")),
        sa.ForeignKeyConstraint(
            ["reporter_id"], ["users.id"], name=op.f("fk_reports_reporter_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reports")),
        sa.UniqueConstraint("post_id", "reporter_id", name="uq_reports_post_reporter"),
    )
    op.create_index(op.f("ix_reports_post_id"), "reports", ["post_id"], unique=False)
    op.create_index(op.f("ix_reports_reporter_id"), "reports", ["reporter_id"], unique=False)
    op.create_index(op.f("ix_reports_status"), "reports", ["status"], unique=False)
    op.create_table(
        "repair_status_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repair_id", sa.Integer(), nullable=False),
        sa.Column(
            "from_status",
            sa.Enum("pending", "accepted", "in_progress", "completed", name="repair_status"),
            nullable=True,
        ),
        sa.Column(
            "to_status",
            sa.Enum("pending", "accepted", "in_progress", "completed", name="repair_status"),
            nullable=False,
        ),
        sa.Column("changed_by", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["changed_by"], ["users.id"], name=op.f("fk_repair_status_history_changed_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["repair_id"],
            ["repair_requests.post_id"],
            name=op.f("fk_repair_status_history_repair_id_repair_requests"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_repair_status_history")),
    )
    op.create_index(
        op.f("ix_repair_status_history_repair_id"),
        "repair_status_history",
        ["repair_id"],
        unique=False,
    )
    op.create_table(
        "report_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column(
            "from_status",
            sa.Enum(
                "reported",
                "under_review",
                "upheld",
                "content_removed",
                "dismissed",
                name="report_status",
            ),
            nullable=False,
        ),
        sa.Column(
            "to_status",
            sa.Enum(
                "reported",
                "under_review",
                "upheld",
                "content_removed",
                "dismissed",
                name="report_status",
            ),
            nullable=False,
        ),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["admin_id"], ["users.id"], name=op.f("fk_report_actions_admin_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["report_id"],
            ["reports.id"],
            name=op.f("fk_report_actions_report_id_reports"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_report_actions")),
    )
    op.create_index(
        op.f("ix_report_actions_report_id"), "report_actions", ["report_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_report_actions_report_id"), table_name="report_actions")
    op.drop_table("report_actions")
    op.drop_index(op.f("ix_repair_status_history_repair_id"), table_name="repair_status_history")
    op.drop_table("repair_status_history")
    op.drop_index(op.f("ix_reports_status"), table_name="reports")
    op.drop_index(op.f("ix_reports_reporter_id"), table_name="reports")
    op.drop_index(op.f("ix_reports_post_id"), table_name="reports")
    op.drop_table("reports")
    op.drop_index(op.f("ix_repair_requests_status"), table_name="repair_requests")
    op.drop_index(op.f("ix_repair_requests_assigned_technician_id"), table_name="repair_requests")
    op.drop_table("repair_requests")
    op.drop_index(op.f("ix_lost_found_items_status"), table_name="lost_found_items")
    op.drop_table("lost_found_items")
    op.drop_index(op.f("ix_events_starts_at"), table_name="events")
    op.drop_table("events")
    op.drop_index(op.f("ix_attachments_uploaded_by"), table_name="attachments")
    op.drop_index(op.f("ix_attachments_post_id"), table_name="attachments")
    op.drop_table("attachments")
    op.drop_table("technicians")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_family_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_posts_type"), table_name="posts")
    op.drop_index("ix_posts_status_created_at", table_name="posts")
    op.drop_index("ix_posts_search", table_name="posts", postgresql_using="gin")
    op.drop_index(
        "ix_posts_pinned_until",
        table_name="posts",
        postgresql_where=sa.text("pinned_until IS NOT NULL"),
    )
    op.drop_index(op.f("ix_posts_faculty_id"), table_name="posts")
    op.drop_index("ix_posts_category_created_at", table_name="posts")
    op.drop_index(op.f("ix_posts_author_id"), table_name="posts")
    op.drop_table("posts")
    op.drop_index(op.f("ix_notifications_user_id"), table_name="notifications")
    op.drop_index(
        "ix_notifications_unread",
        table_name="notifications",
        postgresql_where=sa.text("read_at IS NULL"),
    )
    op.drop_table("notifications")
    op.drop_index(
        op.f("ix_email_verification_tokens_user_id"), table_name="email_verification_tokens"
    )
    op.drop_table("email_verification_tokens")
    op.drop_index(op.f("ix_audit_logs_actor_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_action"), table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_table("users")
    op.drop_table("role_permissions")
    op.drop_table("roles")
    op.drop_table("post_categories")
    op.drop_table("permissions")
    op.drop_table("faculties")
    for enum_name in ENUM_TYPES:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
