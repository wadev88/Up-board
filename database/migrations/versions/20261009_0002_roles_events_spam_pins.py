"""ADR-003 business rules — 7 roles, events, repair workflow, spam policy, club pins, Google login

Schema changes:
- role_name: student, teacher, technician, faculty_staff, building_staff, student_club, admin
  (data: staff → faculty_staff; staff with an available technician profile → technician)
- post_type gains `event` (data: announcements that carry event details become events)
- repair_status: pending/accepted/in_progress/completed → open/assigned/in_progress/resolved
- events.priority_level (department < faculty < university), backfilled from the author's role;
  events.ends_at becomes required for NEW rows (CHECK ... NOT VALID keeps legacy rows untouched —
  no end date is invented; queries treat a missing end as ending at starts_at)
- posts: first_pinned_at dropped, pins reset (only student_club may pin now), one stored pin per
  account (unique partial index), pin window ≤ 72 h, removal_reason for soft deletes
- users: password_hash nullable (Google-only accounts), supabase_user_id, posting_suspended_until
- posting_violations / posting_suspensions (spam policy)
- Row Level Security enabled on every public table WITHOUT policies: blocks Supabase's anon /
  authenticated roles (PostgREST) while the API's table-owner role is unaffected.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-09 09:00:00+00:00
"""

# ruff: noqa: S608 — SQL is built only from the constant role/enum names in this file

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_ROLES = ("student", "teacher", "technician", "faculty_staff", "building_staff",
             "student_club", "admin")  # fmt: skip
OLD_ROLES = ("student", "staff", "admin")
NEW_POST_TYPES = ("general", "announcement", "event", "repair", "lost_found")
OLD_POST_TYPES = ("general", "announcement", "repair", "lost_found")
NEW_REPAIR = ("open", "assigned", "in_progress", "resolved")
OLD_REPAIR = ("pending", "accepted", "in_progress", "completed")
REPAIR_UP = {"pending": "open", "accepted": "assigned", "completed": "resolved"}
REPAIR_DOWN = {v: k for k, v in REPAIR_UP.items()}
NEW_ROLE_WEIGHTS = {"teacher": 5, "technician": 0, "building_staff": 10, "student_club": 5}


def _labels(values: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _case(column: str, mapping: dict[str, str]) -> str:
    whens = " ".join(f"WHEN '{a}' THEN '{b}'" for a, b in mapping.items())
    return f"(CASE {column}::text {whens} ELSE {column}::text END)"


def _retype(enum: str, values: Sequence[str], columns: list[tuple[str, str]], mapping=None):
    """Replace a PostgreSQL enum type (values cannot be removed in place), converting data."""
    op.execute(f"ALTER TYPE {enum} RENAME TO {enum}_old")
    op.execute(f"CREATE TYPE {enum} AS ENUM ({_labels(values)})")
    for table, column in columns:
        expr = _case(column, mapping) if mapping else f"{column}::text"
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {enum} USING ({expr})::{enum}")
    op.execute(f"DROP TYPE {enum}_old")


def _role_id(name: str) -> str:
    return f"(SELECT id FROM roles WHERE name = '{name}')"


def upgrade() -> None:
    # ---------- roles ----------
    _retype("role_name", NEW_ROLES, [("roles", "name")], {"staff": "faculty_staff"})
    for name, weight in NEW_ROLE_WEIGHTS.items():  # existing installs; fresh DBs use the seeder
        op.execute(
            f"INSERT INTO roles (id, name, weight) "
            f"SELECT (SELECT MAX(id) + 1 FROM roles), '{name}', {weight} "
            f"WHERE EXISTS (SELECT 1 FROM roles) "
            f"AND NOT EXISTS (SELECT 1 FROM roles WHERE name = '{name}')"
        )
    op.execute(
        f"UPDATE users SET role_id = {_role_id('technician')} "
        f"FROM technicians t WHERE t.user_id = users.id AND t.is_available "
        f"AND users.role_id = {_role_id('faculty_staff')}"
    )

    # ---------- users ----------
    op.alter_column("users", "password_hash", existing_type=sa.Text(), nullable=True)
    op.add_column("users", sa.Column("supabase_user_id", sa.Uuid(), nullable=True))
    op.add_column(
        "users", sa.Column("posting_suspended_until", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_unique_constraint(op.f("uq_users_supabase_user_id"), "users", ["supabase_user_id"])

    # ---------- post types & events ----------
    _retype("post_type", NEW_POST_TYPES, [("posts", "type"), ("post_categories", "allowed_type")])
    op.execute(
        "UPDATE posts SET type = 'event' WHERE type = 'announcement' "
        "AND EXISTS (SELECT 1 FROM events e WHERE e.post_id = posts.id)"
    )
    event_priority = postgresql.ENUM(
        "department", "faculty", "university", name="event_priority", create_type=False
    )
    event_priority.create(op.get_bind(), checkfirst=False)
    op.add_column(
        "events",
        sa.Column("priority_level", event_priority, nullable=False, server_default="department"),
    )
    op.execute(
        "UPDATE events e SET priority_level = CASE r.name::text "
        "WHEN 'admin' THEN 'university'::event_priority "
        "WHEN 'faculty_staff' THEN 'faculty'::event_priority "
        "ELSE 'department'::event_priority END "
        "FROM posts p JOIN users u ON u.id = p.author_id JOIN roles r ON r.id = u.role_id "
        "WHERE p.id = e.post_id"
    )
    op.alter_column("events", "priority_level", server_default=None)
    op.create_index(op.f("ix_events_ends_at"), "events", ["ends_at"], unique=False)
    op.execute(
        "ALTER TABLE events ADD CONSTRAINT ck_events_ends_at_required "
        "CHECK (ends_at IS NOT NULL) NOT VALID"
    )

    # ---------- repairs ----------
    op.execute("ALTER TABLE repair_requests ALTER COLUMN status DROP DEFAULT")
    _retype(
        "repair_status",
        NEW_REPAIR,
        [
            ("repair_requests", "status"),
            ("repair_status_history", "from_status"),
            ("repair_status_history", "to_status"),
        ],
        REPAIR_UP,
    )

    # ---------- posts: pins & soft-delete reason ----------
    op.drop_constraint(op.f("ck_posts_pin_max_72h"), "posts", type_="check")
    op.drop_constraint(op.f("ck_posts_pin_pair"), "posts", type_="check")
    op.execute("UPDATE posts SET pinned_at = NULL, pinned_until = NULL, pinned_by = NULL")
    op.drop_column("posts", "first_pinned_at")
    op.create_check_constraint(
        op.f("ck_posts_pin_fields_together"),
        "posts",
        "(pinned_at IS NULL) = (pinned_until IS NULL) AND (pinned_at IS NULL) = (pinned_by IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_posts_pin_window_max_72h"),
        "posts",
        "pinned_until IS NULL OR (pinned_until > pinned_at "
        "AND pinned_until <= pinned_at + INTERVAL '72 hours')",
    )
    op.create_index(
        "uq_posts_pinned_by",
        "posts",
        ["pinned_by"],
        unique=True,
        postgresql_where=sa.text("pinned_by IS NOT NULL"),
    )
    op.create_index(
        "ix_posts_author_created_at",
        "posts",
        ["author_id", sa.literal_column("created_at DESC")],
        unique=False,
    )
    removal_reason = postgresql.ENUM(
        "author", "admin", "moderation", "lost_found_expired", name="removal_reason",
        create_type=False,
    )  # fmt: skip
    removal_reason.create(op.get_bind(), checkfirst=False)
    op.add_column("posts", sa.Column("removal_reason", removal_reason, nullable=True))

    # ---------- spam policy ----------
    violation_action = postgresql.ENUM(
        "warning", "suspension", name="violation_action", create_type=False
    )
    violation_action.create(op.get_bind(), checkfirst=False)
    op.create_table(
        "posting_violations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("previous_post_id", sa.Integer(), nullable=False),
        sa.Column(
            "post_type",
            postgresql.ENUM(*NEW_POST_TYPES, name="post_type", create_type=False),
            nullable=False,
        ),
        sa.Column("action", violation_action, nullable=False),
        sa.Column("window_seconds", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["previous_post_id"],
            ["posts.id"],
            name=op.f("fk_posting_violations_previous_post_id_posts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_posting_violations_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_posting_violations")),
        sa.UniqueConstraint(
            "user_id", "previous_post_id", name="uq_posting_violations_user_anchor"
        ),
    )
    op.create_index(
        op.f("ix_posting_violations_user_id"), "posting_violations", ["user_id"], unique=False
    )
    op.create_table(
        "posting_suspensions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("violation_id", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("lifted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lifted_by", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "ends_at > starts_at", name=op.f("ck_posting_suspensions_ends_after_starts")
        ),
        sa.ForeignKeyConstraint(
            ["lifted_by"], ["users.id"], name=op.f("fk_posting_suspensions_lifted_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_posting_suspensions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["violation_id"],
            ["posting_violations.id"],
            name=op.f("fk_posting_suspensions_violation_id_posting_violations"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_posting_suspensions")),
    )
    op.create_index(
        op.f("ix_posting_suspensions_user_id"), "posting_suspensions", ["user_id"], unique=False
    )

    # ---------- Row Level Security (Supabase defence in depth) ----------
    op.execute(
        """
        DO $$
        DECLARE t record;
        BEGIN
          FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
          END LOOP;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
            EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
            EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE t record;
        BEGIN
          FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
            EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
          END LOOP;
        END $$;
        """
    )
    op.drop_index(op.f("ix_posting_suspensions_user_id"), table_name="posting_suspensions")
    op.drop_table("posting_suspensions")
    op.drop_index(op.f("ix_posting_violations_user_id"), table_name="posting_violations")
    op.drop_table("posting_violations")
    op.execute("DROP TYPE violation_action")

    op.drop_column("posts", "removal_reason")
    op.execute("DROP TYPE removal_reason")
    op.drop_index("ix_posts_author_created_at", table_name="posts")
    op.drop_index(
        "uq_posts_pinned_by", table_name="posts", postgresql_where=sa.text("pinned_by IS NOT NULL")
    )
    op.drop_constraint(op.f("ck_posts_pin_window_max_72h"), "posts", type_="check")
    op.drop_constraint(op.f("ck_posts_pin_fields_together"), "posts", type_="check")
    op.add_column("posts", sa.Column("first_pinned_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE posts SET first_pinned_at = pinned_at")
    op.create_check_constraint(
        op.f("ck_posts_pin_pair"), "posts", "(pinned_at IS NULL) = (pinned_until IS NULL)"
    )
    op.create_check_constraint(
        op.f("ck_posts_pin_max_72h"),
        "posts",
        "pinned_until IS NULL OR (first_pinned_at IS NOT NULL "
        "AND pinned_until <= first_pinned_at + INTERVAL '72 hours')",
    )

    _retype(
        "repair_status",
        OLD_REPAIR,
        [
            ("repair_requests", "status"),
            ("repair_status_history", "from_status"),
            ("repair_status_history", "to_status"),
        ],
        REPAIR_DOWN,
    )

    op.execute("ALTER TABLE events DROP CONSTRAINT ck_events_ends_at_required")
    op.drop_index(op.f("ix_events_ends_at"), table_name="events")
    op.drop_column("events", "priority_level")
    op.execute("DROP TYPE event_priority")
    op.execute("UPDATE posts SET type = 'announcement' WHERE type = 'event'")
    _retype("post_type", OLD_POST_TYPES, [("posts", "type"), ("post_categories", "allowed_type")])

    op.drop_constraint(op.f("uq_users_supabase_user_id"), "users", type_="unique")
    op.drop_column("users", "posting_suspended_until")
    op.drop_column("users", "supabase_user_id")
    # Google-only accounts get an unusable placeholder (no Argon2 hash verifies against it)
    op.execute("UPDATE users SET password_hash = '!google-only' WHERE password_hash IS NULL")
    op.alter_column("users", "password_hash", existing_type=sa.Text(), nullable=False)

    # every staff-like role folds back into `staff`, student_club into `student`
    op.execute(
        f"UPDATE users SET role_id = {_role_id('faculty_staff')} "
        f"WHERE role_id IN (SELECT id FROM roles WHERE name IN "
        f"('teacher', 'technician', 'building_staff')) "
        f"AND EXISTS (SELECT 1 FROM roles WHERE name = 'faculty_staff')"
    )
    op.execute(
        f"UPDATE users SET role_id = {_role_id('student')} "
        f"WHERE role_id IN (SELECT id FROM roles WHERE name = 'student_club') "
        f"AND EXISTS (SELECT 1 FROM roles WHERE name = 'student')"
    )
    op.execute(
        "DELETE FROM roles WHERE name IN "
        "('teacher', 'technician', 'building_staff', 'student_club')"
    )
    _retype("role_name", OLD_ROLES, [("roles", "name")], {"faculty_staff": "staff"})
