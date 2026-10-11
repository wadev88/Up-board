"""removal_reason gets `account_deleted`

Schema changes:
- removal_reason enum: new value `account_deleted`. Deleting a user account soft-deletes every post
  of that author with this reason (rows are kept for audit, never hard-deleted).
  PostgreSQL cannot drop an enum value, so the downgrade maps those rows to `admin` and rebuilds
  the type.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-11 20:00:00+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE removal_reason ADD VALUE IF NOT EXISTS 'account_deleted'")


def downgrade() -> None:
    op.execute("UPDATE posts SET removal_reason = 'admin' WHERE removal_reason = 'account_deleted'")
    op.execute("ALTER TYPE removal_reason RENAME TO removal_reason_old")
    op.execute(
        "CREATE TYPE removal_reason AS ENUM ('author', 'admin', 'moderation', 'lost_found_expired')"
    )
    op.execute(
        "ALTER TABLE posts ALTER COLUMN removal_reason TYPE removal_reason "
        "USING removal_reason::text::removal_reason"
    )
    op.execute("DROP TYPE removal_reason_old")
