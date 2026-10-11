"""Year of study: 1–6 (was 1–8)

Any stored year above 6 is cleared (the student picks again via an admin).

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-10 12:00:00+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NAME = "ck_users_year_of_study_range"


def upgrade() -> None:
    op.execute("UPDATE users SET year_of_study = NULL WHERE year_of_study > 6")
    op.drop_constraint(op.f(NAME), "users", type_="check")
    op.create_check_constraint(op.f(NAME), "users", "year_of_study BETWEEN 1 AND 6")


def downgrade() -> None:
    op.drop_constraint(op.f(NAME), "users", type_="check")
    op.create_check_constraint(op.f(NAME), "users", "year_of_study BETWEEN 1 AND 8")
