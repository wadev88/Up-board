"""Admin-only faculties

Schema changes:
- faculties.admin_only (boolean, default false): the university-central / building-division unit
  (code CENTRAL) can only be assigned by an admin, so it is hidden from the self-service pickers
  and refused on register / onboarding / profile update. Existing users keep their data.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-11 18:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "faculties",
        sa.Column("admin_only", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.execute("UPDATE faculties SET admin_only = true WHERE code = 'CENTRAL'")


def downgrade() -> None:
    op.drop_column("faculties", "admin_only")
