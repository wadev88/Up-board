"""Repair review flow, calendar-day spam policy, programmes, contacts, pins without a limit

Schema changes:
- repair_status: `resolved` -> `closed`, new values `pending_review` and `rejected`
  (enum retyped like migration 0002; downgrade maps closed -> resolved, rejected -> resolved and
  pending_review -> in_progress, which loses the distinction)
- users: year_of_study (+ its CHECK) removed; program_id (FK programs), contact_facebook /
  contact_instagram / contact_line; the DB CHECK `email_up_domain` is dropped (the @up.ac.th rule,
  with the student_club exception, is enforced by the services)
- faculties.is_active; new table programs (stable ids, retired with is_active, never deleted);
  Row Level Security enabled on it like every other public table
- posts: related_repair_id (announcements only); the 72 h pin CHECK and the one-pin-per-account
  unique index are dropped; pin_fields_together now lets pinned_until be NULL (announcement pinned
  for a repair)
- posting_violations: previous_post_id / window_seconds replaced by post_id / series_count, the
  unique (user_id, previous_post_id) is dropped; posting_suspensions.last_day (last suspended
  Asia/Bangkok calendar day, backfilled from ends_at)

Downgrade restores the old shapes where data allows: year_of_study comes back empty, all pins are
cleared before the old pin constraints return, and the e-mail CHECK returns NOT VALID so rows that
no longer satisfy it (student_club accounts with another domain) are not rejected.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-11 09:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_REPAIR = ("open", "assigned", "in_progress", "pending_review", "closed", "rejected")
OLD_REPAIR = ("open", "assigned", "in_progress", "resolved")
REPAIR_UP = {"resolved": "closed"}
REPAIR_DOWN = {"closed": "resolved", "rejected": "resolved", "pending_review": "in_progress"}
REPAIR_COLUMNS = [
    ("repair_requests", "status"),
    ("repair_status_history", "from_status"),
    ("repair_status_history", "to_status"),
]

OLD_PIN_FIELDS = (
    "(pinned_at IS NULL) = (pinned_until IS NULL) AND (pinned_at IS NULL) = (pinned_by IS NULL)"
)
NEW_PIN_FIELDS = (
    "(pinned_at IS NULL) = (pinned_by IS NULL) "
    "AND (pinned_until IS NULL OR (pinned_at IS NOT NULL AND pinned_until > pinned_at))"
)
PIN_WINDOW = (
    "pinned_until IS NULL OR (pinned_until > pinned_at "
    "AND pinned_until <= pinned_at + INTERVAL '72 hours')"
)
EMAIL_CHECK = r"email ~* '^[A-Za-z0-9._%+-]+@up\.ac\.th$'"


def _labels(values: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _case(column: str, mapping: dict[str, str]) -> str:
    whens = " ".join(f"WHEN '{a}' THEN '{b}'" for a, b in mapping.items())
    return f"(CASE {column}::text {whens} ELSE {column}::text END)"


def _retype_repair_status(values: Sequence[str], mapping: dict[str, str]) -> None:
    """Replace the PostgreSQL enum (values cannot be removed in place), converting the data."""
    op.execute("ALTER TABLE repair_requests ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE repair_status RENAME TO repair_status_old")
    op.execute(f"CREATE TYPE repair_status AS ENUM ({_labels(values)})")
    for table, column in REPAIR_COLUMNS:
        expr = _case(column, mapping)
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {column} TYPE repair_status "
            f"USING ({expr})::repair_status"
        )
    op.execute("DROP TYPE repair_status_old")


def upgrade() -> None:
    # ---------- repairs ----------
    _retype_repair_status(NEW_REPAIR, REPAIR_UP)

    # ---------- programmes ----------
    op.add_column(
        "faculties",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_table(
        "programs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("faculty_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name_th", sa.String(length=200), nullable=False),
        sa.Column("name_en", sa.String(length=200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["faculty_id"], ["faculties.id"], name=op.f("fk_programs_faculty_id_faculties")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_programs")),
        sa.UniqueConstraint("code", name=op.f("uq_programs_code")),
    )
    op.create_index(op.f("ix_programs_faculty_id"), "programs", ["faculty_id"], unique=False)
    op.execute("ALTER TABLE programs ENABLE ROW LEVEL SECURITY")  # same as every public table

    # ---------- users ----------
    op.drop_constraint(op.f("ck_users_year_of_study_range"), "users", type_="check")
    op.drop_column("users", "year_of_study")
    op.drop_constraint(op.f("ck_users_email_up_domain"), "users", type_="check")
    op.add_column("users", sa.Column("program_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_users_program_id_programs"), "users", "programs", ["program_id"], ["id"]
    )
    op.create_index(op.f("ix_users_program_id"), "users", ["program_id"], unique=False)
    op.add_column("users", sa.Column("contact_facebook", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("contact_instagram", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("contact_line", sa.String(length=100), nullable=True))

    # ---------- posts: pins without a limit, related repair ----------
    op.drop_constraint(op.f("ck_posts_pin_window_max_72h"), "posts", type_="check")
    op.drop_index("uq_posts_pinned_by", table_name="posts")
    op.drop_constraint(op.f("ck_posts_pin_fields_together"), "posts", type_="check")
    op.create_check_constraint(op.f("ck_posts_pin_fields_together"), "posts", NEW_PIN_FIELDS)
    op.add_column("posts", sa.Column("related_repair_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_posts_related_repair_id_posts"),
        "posts",
        "posts",
        ["related_repair_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_posts_related_repair_id"), "posts", ["related_repair_id"], unique=False
    )
    op.create_check_constraint(
        op.f("ck_posts_related_repair_announcements_only"),
        "posts",
        "related_repair_id IS NULL OR type = 'announcement'",
    )

    # ---------- spam policy ----------
    op.add_column("posting_violations", sa.Column("post_id", sa.Integer(), nullable=True))
    op.add_column("posting_violations", sa.Column("series_count", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE posting_violations SET post_id = previous_post_id, "
        "series_count = CASE action::text WHEN 'warning' THEN 3 ELSE 5 END"
    )
    op.alter_column(
        "posting_violations", "series_count", existing_type=sa.Integer(), nullable=False
    )
    op.create_foreign_key(
        op.f("fk_posting_violations_post_id_posts"),
        "posting_violations",
        "posts",
        ["post_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_constraint("uq_posting_violations_user_anchor", "posting_violations", type_="unique")
    op.drop_column("posting_violations", "previous_post_id")  # drops its FK too
    op.drop_column("posting_violations", "window_seconds")

    op.add_column("posting_suspensions", sa.Column("last_day", sa.Date(), nullable=True))
    op.execute(
        "UPDATE posting_suspensions SET last_day = "
        "((ends_at - INTERVAL '1 second') AT TIME ZONE 'Asia/Bangkok')::date"
    )
    op.alter_column("posting_suspensions", "last_day", existing_type=sa.Date(), nullable=False)


def downgrade() -> None:
    # ---------- spam policy ----------
    op.drop_column("posting_suspensions", "last_day")

    op.add_column("posting_violations", sa.Column("previous_post_id", sa.Integer(), nullable=True))
    op.add_column("posting_violations", sa.Column("window_seconds", sa.Integer(), nullable=True))
    op.execute("DELETE FROM posting_violations WHERE post_id IS NULL")
    op.execute(
        "DELETE FROM posting_violations v USING posting_violations w "
        "WHERE v.user_id = w.user_id AND v.post_id = w.post_id AND v.id > w.id"
    )  # the old unique (user_id, previous_post_id) allowed one row per post
    op.execute("UPDATE posting_violations SET previous_post_id = post_id, window_seconds = 180")
    op.alter_column(
        "posting_violations", "previous_post_id", existing_type=sa.Integer(), nullable=False
    )
    op.alter_column(
        "posting_violations", "window_seconds", existing_type=sa.Integer(), nullable=False
    )
    op.create_foreign_key(
        op.f("fk_posting_violations_previous_post_id_posts"),
        "posting_violations",
        "posts",
        ["previous_post_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_posting_violations_user_anchor", "posting_violations", ["user_id", "previous_post_id"]
    )
    op.drop_constraint(
        op.f("fk_posting_violations_post_id_posts"), "posting_violations", type_="foreignkey"
    )
    op.drop_column("posting_violations", "series_count")
    op.drop_column("posting_violations", "post_id")

    # ---------- posts ----------
    op.drop_constraint(op.f("ck_posts_related_repair_announcements_only"), "posts", type_="check")
    op.drop_index(op.f("ix_posts_related_repair_id"), table_name="posts")
    op.drop_constraint(op.f("fk_posts_related_repair_id_posts"), "posts", type_="foreignkey")
    op.drop_column("posts", "related_repair_id")
    op.execute("UPDATE posts SET pinned_at = NULL, pinned_until = NULL, pinned_by = NULL")
    op.drop_constraint(op.f("ck_posts_pin_fields_together"), "posts", type_="check")
    op.create_check_constraint(op.f("ck_posts_pin_fields_together"), "posts", OLD_PIN_FIELDS)
    op.create_check_constraint(op.f("ck_posts_pin_window_max_72h"), "posts", PIN_WINDOW)
    op.create_index(
        "uq_posts_pinned_by",
        "posts",
        ["pinned_by"],
        unique=True,
        postgresql_where=sa.text("pinned_by IS NOT NULL"),
    )

    # ---------- users ----------
    op.drop_column("users", "contact_line")
    op.drop_column("users", "contact_instagram")
    op.drop_column("users", "contact_facebook")
    op.drop_index(op.f("ix_users_program_id"), table_name="users")
    op.drop_constraint(op.f("fk_users_program_id_programs"), "users", type_="foreignkey")
    op.drop_column("users", "program_id")
    op.execute(
        f"ALTER TABLE users ADD CONSTRAINT ck_users_email_up_domain CHECK ({EMAIL_CHECK}) NOT VALID"
    )
    op.add_column("users", sa.Column("year_of_study", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        op.f("ck_users_year_of_study_range"), "users", "year_of_study BETWEEN 1 AND 6"
    )

    # ---------- programmes ----------
    op.drop_index(op.f("ix_programs_faculty_id"), table_name="programs")
    op.drop_table("programs")
    op.drop_column("faculties", "is_active")

    # ---------- repairs ----------
    _retype_repair_status(OLD_REPAIR, REPAIR_DOWN)
