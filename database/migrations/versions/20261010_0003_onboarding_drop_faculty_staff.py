"""Onboarding (student / teacher chosen at first sign-in) and removal of faculty_staff

Schema changes:
- role_name loses `faculty_staff` (data: those accounts become `teacher`; the role row and its
  role_permissions are deleted — the seeder re-syncs the permission matrix)
- users.year_of_study (1–8, students only) and users.profile_completed_at
  (NULL = the account still has to pick student / teacher). Backfill: every existing account is
  complete except Google-only students, who were auto-created as `student` without being asked.

Downgrade restores the enum value and role row but cannot tell which teachers used to be
faculty_staff, so they stay `teacher`.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-10 09:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_ROLES = ("student", "teacher", "technician", "building_staff", "student_club", "admin")
OLD_ROLES = ("student", "teacher", "technician", "faculty_staff", "building_staff",
             "student_club", "admin")  # fmt: skip


def _labels(values: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _retype_roles(values: Sequence[str]) -> None:
    op.execute("ALTER TYPE role_name RENAME TO role_name_old")
    op.execute(f"CREATE TYPE role_name AS ENUM ({_labels(values)})")
    op.execute("ALTER TABLE roles ALTER COLUMN name TYPE role_name USING (name::text)::role_name")
    op.execute("DROP TYPE role_name_old")


def upgrade() -> None:
    op.execute(
        "UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'teacher') "
        "WHERE role_id = (SELECT id FROM roles WHERE name = 'faculty_staff')"
    )
    op.execute("DELETE FROM roles WHERE name = 'faculty_staff'")
    _retype_roles(NEW_ROLES)

    op.add_column("users", sa.Column("year_of_study", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        op.f("ck_users_year_of_study_range"), "users", "year_of_study BETWEEN 1 AND 8"
    )
    op.add_column(
        "users", sa.Column("profile_completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        "UPDATE users SET profile_completed_at = created_at "
        "WHERE password_hash IS NOT NULL "
        "OR role_id <> (SELECT id FROM roles WHERE name = 'student')"
    )


def downgrade() -> None:
    op.drop_column("users", "profile_completed_at")
    op.drop_constraint(op.f("ck_users_year_of_study_range"), "users", type_="check")
    op.drop_column("users", "year_of_study")
    _retype_roles(OLD_ROLES)
    op.execute(
        "INSERT INTO roles (id, name, weight) "
        "SELECT (SELECT MAX(id) + 1 FROM roles), 'faculty_staff', 10 "
        "WHERE EXISTS (SELECT 1 FROM roles) "
        "AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'faculty_staff')"
    )
